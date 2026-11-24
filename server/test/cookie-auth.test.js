import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mock, test } from "node:test";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import request from "supertest";

const uri = process.env.AUTH_SESSION_TEST_MONGODB_URI;
const moduleUrl = (path) => new URL(`../src/${path}`, import.meta.url).href;
const origin = "https://preview.example.test";
const authPath = "/api/auth";
const accessName = "__Host-devmind-access";
const refreshName = "__Host-devmind-refresh";
const csrfName = "__Host-devmind-csrf";
const jwtSecret = "synthetic-cookie-token-key-for-tests";
const csrfHeader = "X-DevMind-CSRF";

function cookieJar(response, names = [accessName, refreshName]) {
  return names
    .map((name) => {
      const header = response.headers["set-cookie"]?.find((value) =>
        value.startsWith(`${name}=`),
      );
      assert.ok(header, `Expected ${name} cookie`);
      assert.match(header, /; Path=\//i);
      assert.match(header, /; HttpOnly/i);
      assert.match(header, /; Secure/i);
      assert.match(header, /; SameSite=Lax/i);
      assert.doesNotMatch(header, /; Domain=/i);
      return header.split(";")[0];
    })
    .join("; ");
}

const onlyRefresh = (jar) =>
  jar.split("; ").find((cookie) => cookie.startsWith(refreshName));

test(
  "staged cookie auth over Express and MongoDB",
  {
    skip:
      !uri &&
      !process.env.CI &&
      "Set AUTH_SESSION_TEST_MONGODB_URI for disposable MongoDB",
  },
  async (t) => {
    assert.ok(uri, "CI requires AUTH_SESSION_TEST_MONGODB_URI");
    Object.assign(process.env, {
      ENABLE_COOKIE_AUTH: "true",
      COOKIE_AUTH_ORIGINS: origin,
      COOKIE_AUTH_JWT_SECRET: jwtSecret,
      COOKIE_AUTH_CSRF_SECRET: "synthetic-cookie-csrf-key-for-tests",
      JWT_SECRET: "legacy-bearer-test-secret",
      MONGODB_URI: uri,
      REDIS_URL: "redis://cookie-auth-test",
      GEMINI_API_KEY: "cookie-auth-test-key",
      NODE_ENV: "production",
    });

    mock.module(moduleUrl("config/redis.ts"), {
      exports: { default: { call: async () => null, on: () => {} } },
    });
    mock.module("rate-limit-redis", {
      exports: {
        default: class RedisStore {
          init() {}
          async increment() {
            return { totalHits: 1, resetTime: new Date(Date.now() + 60_000) };
          }
          async decrement() {}
          async resetKey() {}
        },
      },
    });

    const { default: app } = await import("../src/app.ts");
    const { default: Account } = await import("../src/models/Account.ts");
    const { default: AuthSession } =
      await import("../src/models/AuthSession.ts");
    await mongoose.connect(uri, {
      dbName: `devmind_cookies_${randomUUID()}`,
      serverSelectionTimeoutMS: 5_000,
    });
    t.after(async () => {
      try {
        await mongoose.connection.dropDatabase();
      } finally {
        await mongoose.disconnect();
      }
    });
    await Promise.all([Account.init(), AuthSession.init()]);

    const client = request(app);
    const bootstrap = (purpose = "") =>
      client
        .get(`${authPath}/csrf${purpose}`)
        .set(csrfHeader, "bootstrap")
        .set("Sec-Fetch-Site", "same-origin");
    const get = (path, cookies) => client.get(path).set("Cookie", cookies);
    const post = (path, cookies, proof) =>
      client
        .post(path)
        .set("Origin", origin)
        .set("Cookie", cookies)
        .set(csrfHeader, proof);

    async function preAuth() {
      const response = await bootstrap("?purpose=credentials")
        .expect(200)
        .expect("Cache-Control", "no-store");
      return {
        cookies: cookieJar(response, [csrfName]),
        proof: response.body.csrfToken,
      };
    }

    async function credentials(path, payload, status) {
      const { cookies, proof } = await preAuth();
      return post(`${authPath}/${path}`, cookies, proof)
        .send(payload)
        .expect(status)
        .expect("Cache-Control", "no-store");
    }

    async function register() {
      const payload = {
        email: `${randomUUID()}@example.test`,
        password: "test-password",
        name: "Cookie Test",
      };
      const response = await credentials("register", payload, 201);
      assert.deepEqual(Object.keys(response.body), ["user"]);
      return {
        payload,
        cookies: cookieJar(response),
        user: response.body.user,
      };
    }

    async function sessionProof(cookies) {
      return (await bootstrap().set("Cookie", cookies).expect(200)).body
        .csrfToken;
    }

    await t.test(
      "registers and signs in with host-only cookies and rejects bearer fallback",
      async () => {
        const { payload, cookies, user } = await register();
        const access = cookies.split("; ")[0].slice(accessName.length + 1);
        const signed = jwt.verify(access, jwtSecret, {
          issuer: "devmind",
          audience: "devmind-browser",
          algorithms: ["HS256"],
        });
        assert.ok(signed.exp - signed.iat <= 900);
        assert.ok(signed.exp - signed.iat >= 895);
        assert.equal(signed.sub, user.id);
        const restored = await get(`${authPath}/session`, cookies)
          .expect(200)
          .expect("Cache-Control", "no-store");
        assert.deepEqual(restored.body, { user, refreshGeneration: 0 });
        const bearer = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
        await client
          .get("/api/notes")
          .set("Authorization", `Bearer ${bearer}`)
          .expect(401);

        await credentials(
          "login",
          { ...payload, password: "wrong-password" },
          401,
        );
        const signedIn = await credentials("login", payload, 200);
        assert.deepEqual(signedIn.body, { user });
        assert.notEqual(cookieJar(signedIn), cookies);
        await get("/api/notes", cookieJar(signedIn))
          .expect(200)
          .expect("Cache-Control", "no-store");
      },
    );

    await t.test(
      "rejects cross-origin and unbound CSRF proofs before writes",
      async () => {
        const { cookies } = await register();
        const other = await register();
        const proof = await sessionProof(cookies);
        await client
          .get(`${authPath}/csrf?purpose=credentials`)
          .set(csrfHeader, "bootstrap")
          .set("Origin", "https://other.example.test")
          .set("Sec-Fetch-Site", "cross-site")
          .expect(403);
        await client.get(`${authPath}/csrf?purpose=credentials`).expect(403);
        await client
          .post(`${authPath}/login`)
          .set("Origin", origin)
          .send({})
          .expect(403);
        await client.post(`${authPath}/register`).send({}).expect(403);
        await post("/api/collections", other.cookies, proof)
          .send({ name: "Rejected" })
          .expect(403);
        await post(`${authPath}/refresh`, other.cookies, proof).expect(403);
        await post(`${authPath}/logout`, other.cookies, proof).expect(403);
        await client
          .post("/api/notes/search")
          .set("Origin", origin)
          .set("Cookie", cookies)
          .send({ query: "protected" })
          .expect(403);
        await post("/api/collections", cookies, proof)
          .send({ name: "Allowed" })
          .expect(201);
        await get(`${authPath}/session`, other.cookies).expect(200);
      },
    );

    await t.test(
      "refreshes expired access and rejects later token reuse",
      async (subtest) => {
        const { cookies } = await register();
        subtest.mock.timers.enable({
          apis: ["Date"],
          now: Date.now() + 901_000,
        });
        const expiredAccess = onlyRefresh(cookies);
        await get("/api/notes", cookies)
          .expect(401)
          .expect(({ body }) => {
            assert.equal(body.code, "ACCESS_EXPIRED");
          });
        await get(`${authPath}/session`, expiredAccess)
          .expect(401)
          .expect(({ body }) => {
            assert.equal(body.code, "ACCESS_EXPIRED");
          });
        const proof = await sessionProof(expiredAccess);
        const rotated = await post(
          `${authPath}/refresh`,
          expiredAccess,
          proof,
        ).expect(204);
        const successor = cookieJar(rotated);
        assert.notEqual(onlyRefresh(successor), expiredAccess);
        const valid = await get(`${authPath}/session`, successor).expect(200);
        assert.equal(valid.body.refreshGeneration, 1);
        await post(`${authPath}/refresh`, expiredAccess, proof)
          .expect(401)
          .expect(({ body }) => {
            assert.equal(body.code, "AUTH_REQUIRED");
          });
        await get("/api/notes", successor).expect(401);
      },
    );

    await t.test(
      "a concurrent refresh loser gets a conflict without overwriting the winner cookies",
      async (subtest) => {
        const { cookies } = await register();
        const proof = await sessionProof(cookies);
        const bothAtWrite = Promise.withResolvers();
        const originalUpdate = AuthSession.updateOne;
        let arrivals = 0;
        subtest.mock.method(AuthSession, "updateOne", async function (...args) {
          if (++arrivals === 2) bothAtWrite.resolve();
          await bothAtWrite.promise;
          return originalUpdate.apply(this, args);
        });
        const responses = await Promise.all([
          post(`${authPath}/refresh`, cookies, proof),
          post(`${authPath}/refresh`, cookies, proof),
        ]);
        assert.deepEqual(
          responses.map(({ status }) => status).toSorted(),
          [204, 409],
        );
        const winner = responses.find(({ status }) => status === 204);
        const conflict = responses.find(({ status }) => status === 409);
        assert.equal(conflict.body.code, "REFRESH_CONFLICT");
        assert.equal(conflict.headers["set-cookie"], undefined);
        await get(`${authPath}/session`, cookieJar(winner)).expect(200);
      },
    );

    await t.test(
      "discovery reconciles lost refresh responses without reconstructing credentials",
      async () => {
        const { cookies } = await register();
        const proof = await sessionProof(cookies);
        const rotated = await post(
          `${authPath}/refresh`,
          cookies,
          proof,
        ).expect(204);
        const successor = cookieJar(rotated);
        await get(`${authPath}/session`, successor)
          .expect(200)
          .expect(({ body }) => {
            assert.equal(body.refreshGeneration, 1);
          });
        // Discard the Set-Cookie headers and check the original browser cookies.
        await get(`${authPath}/session`, cookies)
          .expect(401)
          .expect(({ body }) => {
            assert.equal(body.code, "AUTH_REQUIRED");
          });
        await get(`${authPath}/session`, successor).expect(200);
      },
    );

    await t.test(
      "logout with a consumed cookie revokes the same family and clears the cookies",
      async () => {
        const { cookies } = await register();
        const proof = await sessionProof(cookies);
        const rotated = await post(
          `${authPath}/refresh`,
          cookies,
          proof,
        ).expect(204);
        const successor = cookieJar(rotated);
        const signedOut = await post(
          `${authPath}/logout`,
          cookies,
          proof,
        ).expect(204);
        assert.equal(cookieJar(signedOut), `${accessName}=; ${refreshName}=`);
        await get("/api/notes", successor).expect(401);
        await post(`${authPath}/refresh`, successor, proof).expect(401);
      },
    );

    await t.test(
      "a database error stays recoverable and parser failures never print submitted credentials",
      async (subtest) => {
        const { cookies } = await register();
        const proof = await sessionProof(cookies);
        const rejected = new Error("synthetic-private-error-body");
        const logs = subtest.mock.method(console, "error", () => {});
        const lookup = subtest.mock.method(AuthSession, "findOne", () => {
          throw rejected;
        });
        await get("/api/notes", cookies)
          .expect(503)
          .expect(({ body }) => {
            assert.equal(body.code, "SESSION_UNAVAILABLE");
            assert.doesNotMatch(JSON.stringify(body), /synthetic-private/);
          });
        const refresh = await post(
          `${authPath}/refresh`,
          cookies,
          proof,
        ).expect(503);
        assert.equal(refresh.headers["set-cookie"], undefined);
        lookup.mock.restore();
        await get(`${authPath}/session`, cookies).expect(200);

        const anonymous = await preAuth();
        await post(`${authPath}/login`, anonymous.cookies, anonymous.proof)
          .type("json")
          .send('{"password":"synthetic-private-password",}')
          .expect(400)
          .expect(({ body }) => {
            assert.equal(body.error.code, "INVALID_JSON");
            assert.doesNotMatch(JSON.stringify(body), /synthetic-private/);
          });
        assert.doesNotMatch(
          JSON.stringify(logs.mock.calls.map(({ arguments: args }) => args)),
          /synthetic-private/,
        );
      },
    );
  },
);
