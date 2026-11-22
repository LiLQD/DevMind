import type { Types } from "mongoose";
import MonthlyUsage from "../models/MonthlyUsage.ts";

type UsageCounter = "noteEmbeddingRequests";

function utcMonthStart(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function currentUtcMonth() {
  const monthStart = utcMonthStart(new Date());
  const resetAt = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1),
  );
  return { monthStart, resetAt };
}

function isDuplicateKey(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

export async function getMonthlyUsage(accountId: Types.ObjectId) {
  const { monthStart, resetAt } = currentUtcMonth();
  const usage = await MonthlyUsage.findOne({ accountId, monthStart })
    .select("semanticSearchRequests noteEmbeddingRequests")
    .lean();

  return {
    semanticSearchRequests: usage?.semanticSearchRequests ?? 0,
    noteEmbeddingRequests: usage?.noteEmbeddingRequests ?? 0,
    resetAt,
  };
}

export async function reserveSemanticSearch(
  accountId: Types.ObjectId,
  allowance: number,
) {
  const { monthStart, resetAt } = currentUtcMonth();
  const filter = {
    accountId,
    monthStart,
    $or: [
      { semanticSearchRequests: { $lt: allowance } },
      { semanticSearchRequests: { $exists: false } },
    ],
  };
  const update = { $inc: { semanticSearchRequests: 1 } };

  await MonthlyUsage.init();
  try {
    const result = await MonthlyUsage.updateOne(filter, update, {
      upsert: true,
    });
    return {
      allowed: result.matchedCount === 1 || result.upsertedCount === 1,
      resetAt,
    };
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    // The unique account/month index blocks insertion if that month already
    // exists. Retry the conditional update to handle simultaneous first use.
    const result = await MonthlyUsage.updateOne(filter, update);
    return { allowed: result.matchedCount === 1, resetAt };
  }
}

export async function recordUsage(
  accountId: Types.ObjectId,
  counter: UsageCounter,
) {
  const monthStart = utcMonthStart(new Date());
  const filter = { accountId, monthStart };
  const update = { $inc: { [counter]: 1 } };

  try {
    await MonthlyUsage.init();
    try {
      await MonthlyUsage.updateOne(filter, update, { upsert: true });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      // A concurrent first request already created this account's month.
      await MonthlyUsage.updateOne(filter, update);
    }
  } catch (error) {
    console.error("Failed to record monthly usage:", error);
  }
}
