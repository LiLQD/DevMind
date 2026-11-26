import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { mock, test } from "node:test";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import request from "supertest";
import {
  configureTestCookies,
  testOrigin,
} from "../test-support/cookie-fixture.js";

const uri = process.env.AUTH_SESSION_TEST_MONGODB_URI;
const issuer = "https://accounts.google.com";
const clientId = "mock-google-client";
const callback = testOrigin + "/api/auth/google/callback";
const csrf = "X-DevMind-CSRF";
const moduleUrl = (path) => new URL(`../src/${path}`, import.meta.url).href;
const metadata = {
  issuer,
  authorization_endpoint: issuer + "/o/oauth2/v2/auth",
  token_endpoint: "https://oauth2.googleapis.com/token",
  jwks_uri: "https://www.googleapis.com/oauth2/v3/certs",
  response_types_supported: ["code"],
  subject_types_supported: ["public"],
  id_token_signing_alg_values_supported: ["RS256"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["client_secret_post"],
};

class Browser {
  jar = new Map();
  session;

  constructor(api) {
    this.api = api;
  }

  async call(method, path, body, proof) {
    const req = this.api[method](path)
      .set("Origin", testOrigin)
      .set(
        "Cookie",
        [...this.jar].map(([key, value]) => `${key}=${value}`).join("; "),
      );
    if (proof) req.set(csrf, proof);
    if (this.session) req.set("X-DevMind-Session", this.session);
    if (body !== undefined) req.send(body);
    const res = await req;
    for (const cookie of res.headers["set-cookie"] ?? []) {
      const [name, value] = cookie.split(";")[0].split("=");
      if (value) this.jar.set(name, value);
      else this.jar.delete(name);
    }
    return res;
  }

  async post(path, mode = "sign-in", body = {}) {
    const proof = await this.call(
      "get",
      "/api/auth/csrf" + (mode === "sign-in" ? "?purpose=credentials" : ""),
      undefined,
      "bootstrap",
    );
    assert.equal(proof.status, 200);
    return this.call("post", path, body, proof.body.csrfToken);
  }

  async register(email, name = "Password Owner") {
    const response = await this.post("/api/auth/register", "sign-in", {
      email,
      name,
      password: "test-password",
    });
    assert.equal(response.status, 201);
    return this.discover();
  }

  async discover() {
    const response = await this.call("get", "/api/auth/session");
    assert.equal(response.status, 200);
    this.session = response.body.sessionId;
    return response.body.user;
  }
}

const finish = (browser, mode = "sign-in") =>
  browser.post(`/api/auth/google/finish-${mode}`, mode);
const redirected = (response, result) => {
  assert.equal(response.status, 303);
  assert.equal(response.headers.location, `${testOrigin}/?google=${result}`);
  assert.match(response.headers["cache-control"], /no-store/);
  assert.equal(response.headers["referrer-policy"], "no-referrer");
  assert.equal(response.headers["set-cookie"], undefined);
};

test(
  "Google OIDC and explicit linking through real MongoDB accounts",
  { skip: !uri && !process.env.CI },
  async (t) => {
    assert.ok(uri);
    configureTestCookies();
    Object.assign(process.env, {
      NODE_ENV: "test",
      MONGODB_URI: uri,
      REDIS_URL: "redis://test",
      GEMINI_API_KEY: "test",
      GOOGLE_AUTH_ENABLED: "true",
      GOOGLE_AUTH_CLIENT_ID: clientId,
      GOOGLE_AUTH_CLIENT_SECRET: "test-secret",
      GOOGLE_AUTH_APP_ORIGIN: testOrigin,
      GOOGLE_AUTH_CALLBACK_URI: callback,
    });
    const entry = new Map();
    let redisDown = false;
    mock.module(moduleUrl("config/redis.ts"), {
      exports: {
        default: {
          call: async () => null,
          on() {},
          async set(key, value, _, ttl) {
            if (redisDown) throw Error("unavailable");
            entry.set(key, { value, expires: Date.now() + ttl * 1000 });
          },
          async getdel(key) {
            if (redisDown) throw Error("unavailable");
            const current = entry.get(key);
            entry.delete(key);
            return current?.expires > Date.now() ? current.value : null;
          },
        },
      },
    });
    mock.module("rate-limit-redis", {
      exports: {
        default: class {
          init() {}
          async increment() {
            return { totalHits: 1, resetTime: new Date(Date.now() + 60_000) };
          }
          async decrement() {}
          async resetKey() {}
        },
      },
    });

    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const wrong = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    }).privateKey;
    const key = {
      ...publicKey.export({ format: "jwk" }),
      kid: "test-key",
      alg: "RS256",
      use: "sig",
    };
    const grants = new Map();
    let exchanges = 0;
    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input, options) => {
        const url = String(input);
        if (url.endsWith("/.well-known/openid-configuration"))
          return Response.json(metadata);
        if (url === metadata.jwks_uri) return Response.json({ keys: [key] });
        if (url !== metadata.token_endpoint)
          throw Error("Unexpected provider URL");
        exchanges++;
        const fields = new URLSearchParams(options.body);
        assert.equal(fields.get("redirect_uri"), callback);
        assert.equal(fields.get("client_secret"), "test-secret");
        assert.ok(fields.get("code_verifier"));
        const grant = grants.get(fields.get("code"));
        if (grant?.outage)
          throw new DOMException("simulated timeout", "TimeoutError");
        assert.ok(grant);
        const { signature, ...claims } = grant;
        const token = jwt.sign(claims, signature ? wrong : privateKey, {
          algorithm: "RS256",
          keyid: key.kid,
        });
        return Response.json({
          access_token: "synthetic",
          token_type: "Bearer",
          id_token: token,
        });
      },
    );

    const { default: app } = await import("../src/app.ts");
    const { default: Account } = await import("../src/models/Account.ts");
    const { default: AuthSession } =
      await import("../src/models/AuthSession.ts");
    await mongoose.connect(uri, {
      dbName: `google_test_${randomUUID()}`,
      serverSelectionTimeoutMS: 5000,
    });
    t.after(async () => {
      fetchMock.mock.restore();
      try {
        await mongoose.connection.dropDatabase();
      } finally {
        await mongoose.disconnect();
      }
    });
    const api = request(app);

    async function start(browser, mode = "sign-in") {
      const response = await browser.post(`/api/auth/google/${mode}`, mode);
      assert.equal(response.status, 200, JSON.stringify(response.body));
      const url = new URL(response.body.url);
      assert.equal(url.searchParams.get("scope"), "openid email profile");
      assert.equal(url.searchParams.get("code_challenge_method"), "S256");
      assert.equal(url.searchParams.get("redirect_uri"), callback);
      assert.equal(url.searchParams.get("access_type"), null);
      return url;
    }

    async function complete(browser, url, extra = {}) {
      const code = randomUUID();
      grants.set(code, {
        iss: issuer,
        aud: clientId,
        sub: "google-stable-id",
        email: "GOOGLE@example.test",
        email_verified: true,
        name: "Google User",
        nonce: url.searchParams.get("nonce"),
        exp: Math.floor(Date.now() / 1000) + 600,
        ...extra,
      });
      const path =
        "/api/auth/google/callback?" +
        new URLSearchParams({
          state: url.searchParams.get("state"),
          code,
          returnTo: "https://evil.example",
        });
      return { response: await browser.call("get", path), path };
    }

    await t.test(
      "creates one provider-only account for concurrent verified callbacks, and signs in by stable ID",
      async () => {
        const users = [new Browser(api), new Browser(api)];
        const urls = await Promise.all(users.map((browser) => start(browser)));
        const callbacks = await Promise.all(
          users.map((browser, index) => complete(browser, urls[index])),
        );
        for (const { response } of callbacks) redirected(response, "sign-in");
        const results = await Promise.all(
          users.map((browser) => finish(browser)),
        );
        assert.deepEqual(
          results.map(({ status }) => status),
          [200, 200],
        );
        const [first, second] = await Promise.all(
          users.map((browser) => browser.discover()),
        );
        assert.equal(first.id, second.id);
        assert.equal(
          await Account.countDocuments({ email: "google@example.test" }),
          1,
        );
        const account = await Account.findById(first.id).lean();
        assert.equal(account.password, undefined);
        assert.deepEqual(
          (await users[0].call("get", "/api/auth/methods")).body,
          { passwordConfigured: false, googleConnected: true },
        );
        const password = await new Browser(api).post(
          "/api/auth/login",
          "sign-in",
          { email: account.email, password: "test-password" },
        );
        assert.equal(password.status, 401);

        const again = new Browser(api);
        redirected(
          (
            await complete(again, await start(again), {
              email: "different@example.test",
              name: "Changed profile",
            })
          ).response,
          "sign-in",
        );
        assert.equal((await finish(again)).status, 200);
        assert.deepEqual(await again.discover(), first);
      },
    );

    await t.test(
      "requires explicit recent-session linking and rejects email matches and identity collisions",
      async () => {
        const owner = new Browser(api);
        const account = await owner.register("owner@example.test");
        const unnamed = new Browser(api);
        const identity = { sub: "owner-google-sub", email: account.email };
        redirected(
          (await complete(unnamed, await start(unnamed), identity)).response,
          "sign-in",
        );
        assert.equal((await finish(unnamed)).body.code, "GOOGLE_EMAIL_IN_USE");
        assert.equal(
          (await owner.call("get", "/api/auth/methods")).body.googleConnected,
          false,
        );
        assert.equal(
          (await owner.call("post", "/api/auth/google/connect")).status,
          403,
        );

        redirected(
          (await complete(owner, await start(owner, "connect"), identity))
            .response,
          "connect",
        );
        assert.deepEqual((await finish(owner, "connect")).body, {
          googleConnected: true,
        });
        assert.deepEqual(await owner.discover(), account);

        const other = new Browser(api);
        await other.register("other@example.test");
        const url = await start(other, "connect");
        redirected((await complete(other, url, identity)).response, "connect");
        assert.equal(
          (await finish(other, "connect")).body.code,
          "GOOGLE_ALREADY_LINKED",
        );
        assert.equal(
          (await other.call("get", "/api/auth/methods")).body.googleConnected,
          false,
        );

        await AuthSession.collection.updateOne(
          { _id: new mongoose.Types.ObjectId(other.session) },
          { $set: { createdAt: new Date(Date.now() - 600_000) } },
        );
        assert.equal(
          (await other.post("/api/auth/google/connect", "connect")).body.code,
          "GOOGLE_RECENT_AUTH",
        );
      },
    );

    await t.test(
      "binds callbacks to the initiating browser, current session and a single use",
      async () => {
        const browser = new Browser(api);
        const url = await start(browser);
        redirected(
          await browser.call(
            "get",
            "/api/auth/google/callback?state=" +
              "a".repeat(43) +
              "&code=unused",
          ),
          "invalid",
        );
        const wrongBrowser = new Browser(api);
        redirected((await complete(wrongBrowser, url)).response, "invalid");
        const original = await complete(browser, url);
        redirected(original.response, "sign-in");
        redirected(await browser.call("get", original.path), "invalid");
        assert.equal((await finish(browser)).status, 200);
        assert.equal(
          (await finish(browser)).body.code,
          "GOOGLE_SESSION_CHANGED",
        );

        const switched = new Browser(api);
        redirected(
          (await complete(switched, await start(switched))).response,
          "sign-in",
        );
        const newerAccount = await switched.register("newer@example.test");
        assert.equal(
          (await finish(switched)).body.code,
          "GOOGLE_SESSION_CHANGED",
        );
        assert.deepEqual(await switched.discover(), newerAccount);

        const linker = new Browser(api);
        await linker.register("linker@example.test");
        const link = await start(linker, "connect");
        assert.equal(
          (await linker.post("/api/auth/logout", "connect")).status,
          204,
        );
        redirected((await complete(linker, link)).response, "invalid");
      },
    );

    await t.test(
      "rejects invalid or expired proof and isolates provider errors from password authentication",
      async () => {
        const invalidClaims = [
          { nonce: "wrong" },
          { iss: "https://invalid.example" },
          { aud: "other" },
          { exp: Math.floor(Date.now() / 1000) - 1000 },
          { signature: "wrong" },
          { email_verified: false },
          { outage: true },
        ];
        for (const extra of invalidClaims) {
          const browser = new Browser(api);
          const { response } = await complete(
            browser,
            await start(browser),
            extra,
          );
          redirected(response, extra.outage ? "unavailable" : "invalid");
          assert.equal((await finish(browser)).body.code, "GOOGLE_EXPIRED");
        }
        const cancelled = new Browser(api);
        const pending = await start(cancelled);
        redirected(
          await cancelled.call(
            "get",
            "/api/auth/google/callback?" +
              new URLSearchParams({
                state: pending.searchParams.get("state"),
                error: "access_denied",
                returnTo: "https://evil.example",
              }),
          ),
          "cancelled",
        );
        const expired = new Browser(api);
        const expiredUrl = await start(expired);
        for (const pair of entry.values()) pair.expires = 0;
        redirected((await complete(expired, expiredUrl)).response, "invalid");
        const noExchange = exchanges;
        redisDown = true;
        try {
          assert.equal(
            (await new Browser(api).post("/api/auth/google/sign-in")).status,
            503,
          );
          assert.equal(exchanges, noExchange);
          await new Browser(api).register("still-works@example.test");
        } finally {
          redisDown = false;
        }
      },
    );
  },
);
