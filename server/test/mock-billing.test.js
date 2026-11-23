import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mock, test } from "node:test";
import mongoose from "mongoose";
import request from "supertest";

const uri = process.env.MOCK_BILLING_TEST_MONGODB_URI;
const moduleUrl = (path) => new URL(`../src/${path}`, import.meta.url).href;

test(
  "opt-in production mock billing lifecycle with MongoDB",
  {
    skip: uri
      ? false
      : "Set MOCK_BILLING_TEST_MONGODB_URI to use disposable MongoDB",
  },
  async (t) => {
    process.env.NODE_ENV = "production";
    process.env.ENABLE_PRODUCTION_MOCK_BILLING = "true";
    process.env.MONGODB_URI = uri;
    process.env.REDIS_URL = "redis://mock-billing-test";
    process.env.JWT_SECRET = "mock-billing-test-secret";
    process.env.GEMINI_API_KEY = "mock-billing-test-key";

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
    const generateQueryEmbedding = mock.fn(async () => [1, 0]);
    const { cosineSimilarity } =
      await import("../src/services/embedding.service.ts");
    mock.module(moduleUrl("services/embedding.service.ts"), {
      exports: {
        cosineSimilarity,
        generateEmbedding: async () => [1, 0],
        generateQueryEmbedding,
      },
    });

    const { default: app } = await import("../src/app.ts");
    const { default: Account } = await import("../src/models/Account.ts");
    const { default: Subscription } =
      await import("../src/models/Subscription.ts");
    const { default: MonthlyUsage } =
      await import("../src/models/MonthlyUsage.ts");
    const { default: Note } = await import("../src/models/Note.ts");
    const { getAccountSubscription } =
      await import("../src/services/subscription.service.ts");

    await mongoose.connect(uri, {
      dbName: `devmind_mock_billing_test_${randomUUID()}`,
    });
    t.after(async () => {
      try {
        await mongoose.connection.dropDatabase();
      } finally {
        await mongoose.disconnect();
      }
    });

    const base = "/api/mock-billing/checkouts";
    const client = request(app);
    async function register(email) {
      const { body } = await client
        .post("/api/auth/register")
        .send({ email, password: "password123", name: "Mock Billing Test" })
        .expect(201);
      const { _id: accountId } = await Account.findOne({ email }).lean();
      const authorization = `Bearer ${body.token}`;
      return {
        accountId,
        start: () => client.post(base).set("Authorization", authorization),
        read: (id) =>
          client.get(`${base}/${id}`).set("Authorization", authorization),
        action: (id, action, expectedRevision, extra = {}) =>
          client
            .post(`${base}/${id}/actions`)
            .set("Authorization", authorization)
            .send({ action, expectedRevision, ...extra }),
        subscription: async () =>
          (
            await client
              .get("/api/subscription")
              .set("Authorization", authorization)
              .expect(200)
          ).body,
        search: () =>
          client
            .post("/api/notes/search")
            .set("Authorization", authorization)
            .send({ query: "billing" }),
      };
    }

    await t.test(
      "requires authentication, ownership, and valid action input",
      async () => {
        const owner = await register("owner@example.com");
        const other = await register("other@example.com");
        const { body: checkout } = await owner
          .start()
          .expect("Cache-Control", "no-store")
          .expect(200);
        assert.deepEqual(checkout.price, {
          amountCents: 500,
          currency: "USD",
          interval: "month",
        });
        assert.match(checkout.message, /No money is charged/);
        assert.equal((await owner.subscription()).plan, "free");

        await client.post(base).expect(401);
        await client.get(`${base}/${checkout.id}`).expect(401);
        await client.post(`${base}/${checkout.id}/actions`).expect(401);
        await other.read(checkout.id).expect(404);
        await other.action(checkout.id, "succeed", 0).expect(404);
        assert.deepEqual(
          (await owner.read(checkout.id).expect(200)).body,
          checkout,
        );

        await owner.start().send({ plan: "pro", price: 0 }).expect(400);
        await owner
          .action(checkout.id, "succeed", 0, { currentPeriodEnd: "2050-01-01" })
          .expect(400);
        await owner.action(checkout.id, "succeed", "0").expect(400);
        await owner.action(checkout.id, "succeed", -1).expect(400);
        await owner.action(checkout.id, "make_pro", 0).expect(400);
        const invalid = await owner.action(checkout.id, "renew", 0).expect(409);
        assert.equal(invalid.body.error.code, "MOCK_BILLING_CONFLICT");
        assert.deepEqual(
          (await owner.read(checkout.id).expect(200)).body,
          checkout,
        );
      },
    );

    await t.test(
      "failure and cancellation close checkout without granting Pro",
      async () => {
        const owner = await register("failed-checkout@example.com");
        const { body: first } = await owner.start().expect(200);
        const { body: failed } = await owner
          .action(first.id, "fail", 0)
          .expect(200);
        assert.equal(failed.state, "failed");
        assert.deepEqual(
          (await owner.action(first.id, "fail", 0).expect(200)).body,
          failed,
        );
        await owner.action(first.id, "succeed", 1).expect(409);
        assert.equal((await owner.subscription()).plan, "free");

        const { body: second } = await owner.start().expect(200);
        assert.notEqual(second.id, first.id);
        await owner.action(first.id, "succeed", 0).expect(404);
        const { body: canceled } = await owner
          .action(second.id, "cancel_checkout", 0)
          .expect(200);
        assert.equal(canceled.state, "canceled");
        assert.equal((await owner.subscription()).plan, "free");
      },
    );

    await t.test(
      "concurrent starts and actions commit one checkout and one transition per revision",
      async () => {
        const owner = await register("races@example.com");
        await Subscription.init();
        const indexes = await Subscription.collection.indexes();
        assert.ok(
          indexes.some(
            ({ key, unique }) =>
              unique && key.accountId === 1 && Object.keys(key).length === 1,
          ),
        );

        const starts = await Promise.all(
          Array.from({ length: 8 }, () => owner.start().expect(200)),
        );
        const checkout = starts[0].body;
        assert.ok(
          starts.every(
            ({ body }) => body.id === checkout.id && body.revision === 0,
          ),
        );
        assert.equal(
          await Subscription.countDocuments({ accountId: owner.accountId }),
          1,
        );

        const completions = await Promise.all(
          Array.from({ length: 8 }, () =>
            owner.action(checkout.id, "succeed", 0).expect(200),
          ),
        );
        assert.ok(
          completions.every(
            ({ body }) => body.state === "succeeded" && body.revision === 1,
          ),
        );
        await owner.start().expect(409);
        const activated = await owner.subscription();
        assert.equal(activated.plan, "pro");

        const renewals = await Promise.all(
          Array.from({ length: 8 }, () =>
            owner.action(checkout.id, "renew", 1).expect(200),
          ),
        );
        assert.ok(renewals.every(({ body }) => body.revision === 2));
        const renewed = await owner.subscription();
        const previousEnd = new Date(activated.currentPeriodEnd);
        const extensionDays =
          (Date.parse(renewed.currentPeriodEnd) - +previousEnd) / 86_400_000;
        assert.ok(extensionDays >= 28 && extensionDays <= 31);
        await owner.action(checkout.id, "succeed", 0).expect(409);
        await owner.action(checkout.id, "renew", 3).expect(409);
        assert.equal(
          (await owner.subscription()).currentPeriodEnd,
          renewed.currentPeriodEnd,
        );

        const competing = await Promise.all([
          owner.action(checkout.id, "expire", 2),
          owner.action(checkout.id, "cancel_subscription", 2),
        ]);
        assert.deepEqual(
          competing.map(({ status }) => status).toSorted(),
          [200, 409],
        );
        assert.equal(
          (await owner.read(checkout.id).expect(200)).body.revision,
          3,
        );
      },
    );

    await t.test(
      "activates Pro at the existing usage boundary and preserves usage after expiration",
      async (scenario) => {
        scenario.mock.timers.enable({
          apis: ["Date"],
          now: new Date("2026-01-15T12:00:00.000Z"),
        });
        const owner = await register("quota-upgrade@example.com");
        await Note.create({
          userId: owner.accountId,
          title: "Mock billing",
          content: "Billing example",
          embeddingStatus: "success",
          embedding: [1, 0],
        });
        const now = new Date();
        const monthStart = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
        );
        await MonthlyUsage.create({
          accountId: owner.accountId,
          monthStart,
          semanticSearchRequests: 100,
          noteEmbeddingRequests: 7,
        });

        await owner.search().expect(429);
        const original = await owner.subscription();
        const { body: checkout } = await owner.start().expect(200);
        await owner.search().expect(429);
        assert.equal(generateQueryEmbedding.mock.callCount(), 0);
        await owner.action(checkout.id, "succeed", 0).expect(200);
        const upgraded = await owner.subscription();
        assert.equal(upgraded.plan, "pro");
        assert.deepEqual(upgraded.usage, original.usage);
        assert.notEqual(upgraded.currentPeriodEnd, upgraded.usage.resetAt);
        await owner.search().expect(200);

        // Seed the remaining boundary instead of making 898 API calls.
        await MonthlyUsage.updateOne(
          { accountId: owner.accountId, monthStart },
          { $set: { semanticSearchRequests: 999 } },
        );
        await owner.search().expect(200);
        await owner.search().expect(429);
        assert.equal(generateQueryEmbedding.mock.callCount(), 2);

        await owner.action(checkout.id, "cancel_subscription", 1).expect(200);
        const canceled = await owner.subscription();
        assert.equal(canceled.plan, "pro");
        assert.equal(canceled.cancelAtPeriodEnd, true);
        assert.equal(canceled.currentPeriodEnd, upgraded.currentPeriodEnd);
        await owner.action(checkout.id, "renew", 2).expect(409);

        await owner.action(checkout.id, "expire", 2).expect(200);
        const expired = await owner.subscription();
        assert.equal(expired.plan, "free");
        assert.equal(expired.status, "canceled");
        assert.deepEqual(expired.usage, {
          ...original.usage,
          semanticSearchRequests: 1000,
        });
        await owner.search().expect(429);
      },
    );

    await t.test(
      "failed renewal applies past_due while a new failed checkout preserves that state",
      async () => {
        const owner = await register("past-due@example.com");
        const { body: checkout } = await owner.start().expect(200);
        await owner.action(checkout.id, "succeed", 0).expect(200);
        const active = await owner.subscription();
        await owner.action(checkout.id, "fail_renewal", 1).expect(200);
        const pastDue = await owner.subscription();
        assert.equal(pastDue.plan, "free");
        assert.equal(pastDue.status, "past_due");
        assert.equal(pastDue.currentPeriodEnd, active.currentPeriodEnd);
        const { body: retry } = await owner.start().expect(200);
        await owner.action(retry.id, "fail", 0).expect(200);
        assert.deepEqual(await owner.subscription(), pastDue);
      },
    );

    await t.test(
      "falls back to Free at the exact period end and leaves non-mock records alone",
      async (scenario) => {
        scenario.mock.timers.enable({
          apis: ["Date"],
          now: new Date("2026-01-31T15:30:00.000Z"),
        });
        const owner = await register("ends@example.com");
        const { body: checkout } = await owner.start().expect(200);
        await owner.action(checkout.id, "succeed", 0).expect(200);
        const active = await owner.subscription();
        assert.equal(active.currentPeriodEnd, "2026-02-28T15:30:00.000Z");
        scenario.mock.timers.setTime(Date.parse(active.currentPeriodEnd));
        assert.equal(
          (await getAccountSubscription(owner.accountId)).plan,
          "free",
        );

        const other = await register("non-mock@example.com");
        const paid = {
          accountId: other.accountId,
          plan: "pro",
          status: "active",
          providerSubscriptionId: "existing-subscription",
          currentPeriodEnd: new Date("2026-03-31T15:30:00.000Z"),
        };
        await Subscription.create(paid);
        const before = await Subscription.findOne({
          accountId: other.accountId,
        }).lean();
        await other.start().expect(409);
        assert.equal((await other.subscription()).plan, "pro");
        assert.deepEqual(
          await Subscription.findOne({ accountId: other.accountId }).lean(),
          before,
        );
      },
    );
  },
);
