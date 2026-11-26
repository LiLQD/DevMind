import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mock, test } from "node:test";
import mongoose from "mongoose";
import request from "supertest";
import {
  configureTestCookies,
  sessionHeaders,
  submitCredentials,
  testOrigin,
} from "../test-support/cookie-fixture.js";

const mongoUri = process.env.AUTH_SESSION_TEST_MONGODB_URI;
const redisUrl = process.env.REGISTRATION_TEST_REDIS_URL;

const expectRegistrationOutcome = (response) =>
  assert.ok([201, 400].includes(response.status));

test(
  "verifies email before creating an account with MongoDB and Redis",
  { skip: (!mongoUri || !redisUrl) && !process.env.CI },
  async (t) => {
    assert.ok(mongoUri && redisUrl);
    configureTestCookies();
    Object.assign(process.env, {
      NODE_ENV: "test",
      MONGODB_URI: mongoUri,
      REDIS_URL: redisUrl,
      GEMINI_API_KEY: "test",
      EMAIL_VERIFICATION_ENABLED: "true",
      EMAIL_VERIFICATION_APP_ORIGIN: testOrigin,
      BREVO_API_KEY: "test-brevo-key",
      BREVO_SENDER_EMAIL: "sender@example.test",
    });

    const sent = [];
    let providerDown = false;
    const emailProvider = mock.method(
      globalThis,
      "fetch",
      async (url, options) => {
        assert.equal(url, "https://api.brevo.com/v3/smtp/email");
        assert.equal(options.headers["api-key"], "test-brevo-key");
        assert.equal(options.method, "POST");
        const body = JSON.parse(options.body);
        assert.equal(body.sender.email, "sender@example.test");
        if (providerDown) return new Response(null, { status: 503 });
        sent.push(body);
        return Response.json({ messageId: "test-message" }, { status: 201 });
      },
    );

    const { default: app } = await import("../src/app.ts");
    const { default: Account } = await import("../src/models/Account.ts");
    const { default: redis } = await import("../src/config/redis.ts");
    t.after(async () => {
      emailProvider.mock.restore();
      try {
        if (mongoose.connection.readyState === 1)
          await mongoose.connection.dropDatabase();
      } finally {
        await Promise.all([redis.quit(), mongoose.disconnect()]);
      }
    });
    await mongoose.connect(mongoUri, {
      dbName: `registration_test_${randomUUID()}`,
      serverSelectionTimeoutMS: 5000,
    });

    const client = request(app);
    const credentials = { name: "New User", password: "test-password" };
    const start = (email, status = 202) =>
      submitCredentials(client, "register/email", { email }, status);
    const finish = (verificationToken, status = 201, extra = {}) =>
      submitCredentials(
        client,
        "register",
        { ...credentials, verificationToken, ...extra },
        status,
      );
    const lastToken = () => {
      const match = sent.at(-1).textContent.match(/^https:\/\/\S+/m);
      const link = new URL(match[0]);
      assert.equal(link.origin, testOrigin);
      assert.equal(link.search, "");
      const token = new URLSearchParams(link.hash.slice(1)).get("verify-email");
      assert.match(token, /^[A-Za-z0-9_-]{43}$/);
      return token;
    };

    await t.test(
      "requires CSRF and a single-use token for the verified email",
      async () => {
        const email = "new@example.test";
        await client
          .get("/api/auth/register/status")
          .expect(200, { emailVerificationRequired: true });
        await client
          .post("/api/auth/register/email")
          .set("Origin", testOrigin)
          .send({ email })
          .expect(403);
        const rejected = await submitCredentials(
          client,
          "register",
          { ...credentials, email },
          400,
        );
        assert.equal(
          rejected.body.code,
          "REGISTRATION_EMAIL_VERIFICATION_REQUIRED",
        );
        assert.equal(rejected.headers["set-cookie"], undefined);

        const accepted = await start("  NEW@Example.Test  ");
        assert.deepEqual(accepted.body, { accepted: true });
        assert.equal(accepted.headers["set-cookie"], undefined);
        assert.deepEqual(sent.at(-1).to, [{ email }]);
        assert.equal(await Account.exists({ email }), null);
        const token = lastToken();
        const replies = await Promise.all([
          finish(token, expectRegistrationOutcome, {
            email: "different@example.test",
          }),
          finish(token, expectRegistrationOutcome),
        ]);
        assert.deepEqual(
          replies.map(({ status }) => status).toSorted(),
          [201, 400],
        );
        const created = replies.find(({ status }) => status === 201);
        assert.equal(created.body.user.email, email);
        const initialAuth = await sessionHeaders(client, created);
        await client.get("/api/auth/session").set(initialAuth).expect(200);
        const account = await Account.findOne({ email }).select(
          "+emailVerifiedAt",
        );
        assert.ok(account?.emailVerifiedAt instanceof Date);
        assert.equal(
          await Account.exists({ email: "different@example.test" }),
          null,
        );

        const replay = await finish(token, 400);
        assert.equal(
          replay.body.code,
          "REGISTRATION_EMAIL_VERIFICATION_REQUIRED",
        );
        const login = await submitCredentials(
          client,
          "login",
          { email, password: credentials.password },
          200,
        );
        const auth = await sessionHeaders(client, login);
        await client.get("/api/auth/session").set(auth).expect(200);
      },
    );

    await t.test(
      "handles cooldowns, existing accounts, link expiry, and provider failures",
      async () => {
        const count = sent.length;
        await start("new@example.test", 429);
        assert.equal(sent.length, count);
        await Account.create({
          name: "Existing",
          email: "existing@example.test",
        });
        await start("existing@example.test");
        assert.equal(sent.length, count);
        await start("not-an-email", 400);
        assert.equal(sent.length, count);

        await start("expired@example.test");
        const token = lastToken();
        const sha = createHash("sha256").update(token).digest("hex");
        const key = `devmind:registration:token:${sha}`;
        const ttl = await redis.ttl(key);
        assert.ok(ttl >= 895 && ttl <= 900);
        await redis.expire(key, 0);
        await finish(token, 400);
        assert.equal(
          await Account.exists({ email: "expired@example.test" }),
          null,
        );

        providerDown = true;
        try {
          const response = await start("outage@example.test", 503);
          assert.equal(response.body.code, "REGISTRATION_EMAIL_UNAVAILABLE");
          assert.equal(
            await Account.exists({ email: "outage@example.test" }),
            null,
          );
        } finally {
          providerDown = false;
        }
      },
    );

    await t.test(
      "limits requests across different recipients from the same IP",
      async () => {
        const first = await start("limit-start@example.test");
        assert.equal(first.headers["ratelimit-limit"], "10");
        const remaining = Number(first.headers["ratelimit-remaining"]);
        assert.ok(
          Number.isInteger(remaining) && remaining >= 0 && remaining < 10,
        );
        for (let i = 0; i < remaining; i++) {
          await start(`limit-${i}@example.test`);
        }
        const count = sent.length;
        await start("limited@example.test", 429);
        assert.equal(sent.length, count);
      },
    );
  },
);
