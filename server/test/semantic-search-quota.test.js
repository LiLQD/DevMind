import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import mongoose from "mongoose";
import MonthlyUsage from "../src/models/MonthlyUsage.ts";
import {
  getMonthlyUsage,
  reserveSemanticSearch,
} from "../src/services/usage.service.ts";

const uri = process.env.QUOTA_TEST_MONGODB_URI;

test(
  "MongoDB allows one reservation per remaining slot under concurrency",
  {
    skip: uri
      ? false
      : "Set QUOTA_TEST_MONGODB_URI to run against disposable MongoDB",
  },
  async (t) => {
    await mongoose.connect(uri, {
      dbName: `devmind_quota_test_${randomUUID()}`,
    });
    t.after(async () => {
      try {
        await mongoose.connection.dropDatabase();
      } finally {
        await mongoose.disconnect();
      }
    });

    await MonthlyUsage.init();
    const indexes = await MonthlyUsage.collection.indexes();
    assert.ok(
      indexes.some(
        ({ key, unique }) =>
          unique &&
          key.accountId === 1 &&
          key.monthStart === 1 &&
          Object.keys(key).length === 2,
      ),
    );

    const accountId = new mongoose.Types.ObjectId();
    const first = await Promise.all(
      Array.from({ length: 12 }, () => reserveSemanticSearch(accountId, 13)),
    );
    assert.equal(first.filter(({ allowed }) => allowed).length, 12);
    assert.equal(await MonthlyUsage.countDocuments({ accountId }), 1);
    assert.equal((await getMonthlyUsage(accountId)).semanticSearchRequests, 12);

    const last = await Promise.all(
      Array.from({ length: 12 }, () => reserveSemanticSearch(accountId, 13)),
    );
    assert.equal(last.filter(({ allowed }) => allowed).length, 1);
    assert.equal((await getMonthlyUsage(accountId)).semanticSearchRequests, 13);
    assert.equal((await getMonthlyUsage(accountId)).noteEmbeddingRequests, 0);
  },
);
