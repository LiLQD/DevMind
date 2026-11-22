import type { Types } from "mongoose";
import MonthlyUsage from "../models/MonthlyUsage.ts";

type UsageCounter = "semanticSearchRequests" | "noteEmbeddingRequests";

function utcMonthStart(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function getMonthlyUsage(accountId: Types.ObjectId) {
  const monthStart = utcMonthStart(new Date());
  const resetAt = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1),
  );
  const usage = await MonthlyUsage.findOne({ accountId, monthStart })
    .select("semanticSearchRequests noteEmbeddingRequests")
    .lean();

  return {
    semanticSearchRequests: usage?.semanticSearchRequests ?? 0,
    noteEmbeddingRequests: usage?.noteEmbeddingRequests ?? 0,
    resetAt,
  };
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
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== 11000
      ) {
        throw error;
      }
      // A concurrent first request already created this account's month.
      await MonthlyUsage.updateOne(filter, update);
    }
  } catch (error) {
    console.error("Failed to record monthly usage:", error);
  }
}
