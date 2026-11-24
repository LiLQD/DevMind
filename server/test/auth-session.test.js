import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import mongoose from "mongoose";
import { readAuthSessionPolicy } from "../src/config/auth-session.ts";

const uri = process.env.AUTH_SESSION_TEST_MONGODB_URI;
const digest = (value) => createHash("sha256").update(value).digest("hex");

test("auth session policy defaults to 15 minutes and 30 days and validates overrides", () => {
  assert.deepEqual(readAuthSessionPolicy({}), {
    accessLifetimeSeconds: 900,
    refreshLifetimeSeconds: 2_592_000,
  });
  assert.deepEqual(
    readAuthSessionPolicy({
      AUTH_ACCESS_TTL_SECONDS: "60",
      AUTH_REFRESH_TTL_SECONDS: "3600",
    }),
    { accessLifetimeSeconds: 60, refreshLifetimeSeconds: 3600 },
  );
  for (const value of ["", "-1", "0", "1.5", "Infinity"]) {
    assert.throws(
      () => readAuthSessionPolicy({ AUTH_ACCESS_TTL_SECONDS: value }),
      /AUTH_ACCESS_TTL_SECONDS/,
    );
  }
  assert.throws(
    () => readAuthSessionPolicy({ AUTH_REFRESH_TTL_SECONDS: "60" }),
    /AUTH_REFRESH_TTL_SECONDS/,
  );
});

test(
  "MongoDB authentication sessions",
  {
    skip:
      !uri &&
      !process.env.CI &&
      "Set AUTH_SESSION_TEST_MONGODB_URI for disposable MongoDB",
  },
  async (t) => {
    assert.ok(uri, "CI requires AUTH_SESSION_TEST_MONGODB_URI");
    const { default: Account } = await import("../src/models/Account.ts");
    const { default: AuthSession } =
      await import("../src/models/AuthSession.ts");
    const {
      createAuthSession,
      getRefreshSession,
      getSessionAccount,
      revokeAccountSessions,
      revokeAuthSession,
      rotateAuthSession,
    } = await import("../src/services/auth-session.service.ts");

    await mongoose.connect(uri, {
      dbName: `devmind_sessions_${randomUUID()}`,
      serverSelectionTimeoutMS: 5_000,
    });
    t.after(async () => {
      try {
        await mongoose.connection.dropDatabase();
      } finally {
        await mongoose.disconnect();
      }
    });
    await AuthSession.init();

    async function createAccount(settings = {}) {
      return Account.create({
        email: `${randomUUID()}@example.test`,
        name: "Session fixture",
        password: "placeholder",
        ...settings,
      });
    }

    await t.test(
      "persists hashes, tracks rotation, and keeps the absolute deadline fixed",
      async () => {
        const account = await createAccount();
        const now = Date.now();
        const first = await createAuthSession(account._id);
        assert.match(first.refreshToken, /^[A-Za-z0-9_-]{43}$/);
        assert.ok(first.accessExpiresAt.getTime() >= now + 900_000);
        assert.ok(first.refreshExpiresAt.getTime() >= now + 2_592_000_000);
        const rotated = await rotateAuthSession(first.refreshToken);
        assert.equal(rotated.status, "rotated");
        const second = rotated.credentials;
        assert.notEqual(first.refreshToken, second.refreshToken);
        assert.deepEqual(first.refreshExpiresAt, second.refreshExpiresAt);
        assert.equal(first.sessionId.toString(), second.sessionId.toString());

        const stored = await AuthSession.collection.findOne({
          _id: first.sessionId,
        });
        assert.equal(stored.currentTokenHash, digest(second.refreshToken));
        assert.deepEqual(stored.consumedTokenHashes, [
          digest(first.refreshToken),
        ]);
        assert.equal(stored.generation, 1);
        assert.ok(stored.createdAt instanceof Date);
        assert.ok(stored.rotatedAt instanceof Date);
        assert.equal(
          JSON.stringify(stored).includes(first.refreshToken),
          false,
        );
        assert.equal(
          JSON.stringify(stored).includes(second.refreshToken),
          false,
        );

        assert.equal(await getRefreshSession(first.refreshToken), null);
        assert.equal(
          (await getRefreshSession(second.refreshToken)).sessionId.toString(),
          first.sessionId.toString(),
        );
        assert.ok(await getSessionAccount(account._id, first.sessionId));
        assert.equal(
          await getSessionAccount(
            new mongoose.Types.ObjectId(),
            first.sessionId,
          ),
          null,
        );
      },
    );

    await t.test(
      "concurrent requests that observe one generation produce one winner without revocation",
      async (subtest) => {
        const account = await createAccount();
        const issued = await createAuthSession(account._id);
        const bothAtWrite = Promise.withResolvers();
        const originalUpdate = AuthSession.updateOne;
        let arrivals = 0;
        subtest.mock.method(AuthSession, "updateOne", async function (...args) {
          if (++arrivals === 2) bothAtWrite.resolve();
          await bothAtWrite.promise;
          return originalUpdate.apply(this, args);
        });

        const results = await Promise.all([
          rotateAuthSession(issued.refreshToken),
          rotateAuthSession(issued.refreshToken),
        ]);
        assert.deepEqual(results.map(({ status }) => status).toSorted(), [
          "conflict",
          "rotated",
        ]);
        const winner = results.find(({ status }) => status === "rotated");
        assert.ok(await getRefreshSession(winner.credentials.refreshToken));
        const stored = await AuthSession.collection.findOne({
          _id: issued.sessionId,
        });
        assert.equal(stored.generation, 1);
        assert.equal(stored.revokedAt, null);
      },
    );

    await t.test(
      "later reuse revokes the family and leaves a second device active",
      async () => {
        const account = await createAccount();
        const firstDevice = await createAuthSession(account._id);
        const otherDevice = await createAuthSession(account._id);
        const next = await rotateAuthSession(firstDevice.refreshToken);
        assert.equal(next.status, "rotated");
        const later = await rotateAuthSession(next.credentials.refreshToken);
        assert.equal(later.status, "rotated");
        assert.deepEqual(
          await rotateAuthSession(randomBytes(32).toString("base64url")),
          {
            status: "invalid",
          },
        );
        assert.ok(await getSessionAccount(account._id, firstDevice.sessionId));

        assert.deepEqual(await rotateAuthSession(firstDevice.refreshToken), {
          status: "reused",
        });
        assert.equal(
          await getSessionAccount(account._id, firstDevice.sessionId),
          null,
        );
        assert.equal(
          await getRefreshSession(later.credentials.refreshToken),
          null,
        );
        assert.ok(await getSessionAccount(account._id, otherDevice.sessionId));
      },
    );

    await t.test(
      "current-session and account-wide revocation invalidate session checks immediately",
      async () => {
        const account = await createAccount();
        await Account.collection.updateOne(
          { _id: account._id },
          { $unset: { sessionVersion: "" } },
        );
        const first = await createAuthSession(account._id);
        const second = await createAuthSession(account._id);
        const otherAccount = await createAccount();
        await revokeAuthSession(otherAccount._id, first.sessionId);
        assert.ok(await getSessionAccount(account._id, first.sessionId));
        await revokeAuthSession(account._id, first.sessionId);
        await revokeAuthSession(account._id, first.sessionId);
        assert.equal(
          await getSessionAccount(account._id, first.sessionId),
          null,
        );
        assert.ok(await getSessionAccount(account._id, second.sessionId));

        await revokeAccountSessions(account._id);
        assert.equal(
          await getSessionAccount(account._id, second.sessionId),
          null,
        );
        assert.deepEqual(await rotateAuthSession(second.refreshToken), {
          status: "invalid",
        });
        const newSession = await createAuthSession(account._id);
        assert.ok(await getSessionAccount(account._id, newSession.sessionId));

        await Account.updateOne(
          { _id: account._id },
          { $set: { isActive: false }, $inc: { sessionVersion: 1 } },
        );
        assert.equal(
          await getSessionAccount(account._id, newSession.sessionId),
          null,
        );
        assert.equal(await createAuthSession(account._id), null);
        assert.deepEqual(await rotateAuthSession(newSession.refreshToken), {
          status: "invalid",
        });
        await Account.updateOne(
          { _id: account._id },
          { $set: { isActive: true } },
        );
        assert.equal(
          await getSessionAccount(account._id, newSession.sessionId),
          null,
        );
      },
    );

    await t.test(
      "logout that wins a rotation race prevents issuance and keeps the session revoked",
      async (subtest) => {
        const account = await createAccount();
        const issued = await createAuthSession(account._id);
        const rotationReady = Promise.withResolvers();
        const releaseRotation = Promise.withResolvers();
        const originalUpdate = AuthSession.updateOne;
        subtest.mock.method(
          AuthSession,
          "updateOne",
          async function (filter, update) {
            if (update.$inc?.generation) {
              rotationReady.resolve();
              await releaseRotation.promise;
            }
            return originalUpdate.call(this, filter, update);
          },
        );

        const rotating = rotateAuthSession(issued.refreshToken);
        try {
          await rotationReady.promise;
          await revokeAuthSession(account._id, issued.sessionId);
        } finally {
          releaseRotation.resolve();
        }
        assert.deepEqual(await rotating, { status: "conflict" });
        assert.equal(
          await getSessionAccount(account._id, issued.sessionId),
          null,
        );
        assert.equal(await getRefreshSession(issued.refreshToken), null);
      },
    );

    await t.test(
      "expiry denies credentials before TTL cleanup and clamps the last access lifetime",
      async (subtest) => {
        const account = await createAccount();
        const issued = await createAuthSession(account._id);
        const deadline = issued.refreshExpiresAt.getTime();
        subtest.mock.timers.enable({ apis: ["Date"], now: deadline - 1_000 });
        const rotated = await rotateAuthSession(issued.refreshToken);
        assert.equal(rotated.status, "rotated");
        assert.equal(rotated.credentials.accessExpiresAt.getTime(), deadline);
        subtest.mock.timers.setTime(deadline);
        assert.ok(
          await AuthSession.collection.findOne({ _id: issued.sessionId }),
        );
        assert.equal(
          await getSessionAccount(account._id, issued.sessionId),
          null,
        );
        assert.equal(
          await getRefreshSession(rotated.credentials.refreshToken),
          null,
        );
        assert.deepEqual(
          await rotateAuthSession(rotated.credentials.refreshToken),
          { status: "invalid" },
        );
        const indexes = await AuthSession.collection.indexes();
        assert.ok(
          indexes.some(
            ({ key, expireAfterSeconds }) =>
              key.expiresAt === 1 && expireAfterSeconds === 0,
          ),
        );
      },
    );

    await t.test(
      "database failures propagate and an ambiguous write cannot be replayed for credentials",
      async (subtest) => {
        const account = await createAccount();
        const issued = await createAuthSession(account._id);
        const unavailable = new Error("synthetic database failure");
        const read = subtest.mock.method(AuthSession, "findOne", () => {
          throw unavailable;
        });
        await assert.rejects(
          getRefreshSession(issued.refreshToken),
          unavailable,
        );
        await assert.rejects(
          rotateAuthSession(issued.refreshToken),
          unavailable,
        );
        read.mock.restore();

        const originalUpdate = AuthSession.updateOne;
        const write = subtest.mock.method(
          AuthSession,
          "updateOne",
          async function (...args) {
            await originalUpdate.apply(this, args);
            throw unavailable;
          },
        );
        await assert.rejects(
          rotateAuthSession(issued.refreshToken),
          unavailable,
        );
        write.mock.restore();
        assert.equal(await getRefreshSession(issued.refreshToken), null);
        assert.deepEqual(await rotateAuthSession(issued.refreshToken), {
          status: "reused",
        });
        assert.equal(
          await getSessionAccount(account._id, issued.sessionId),
          null,
        );
      },
    );
  },
);
