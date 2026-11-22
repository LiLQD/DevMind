import type { Types } from "mongoose";
import MonthlyUsage from "../models/MonthlyUsage.ts";

type UsageCounter = "semanticSearchRequests" | "noteEmbeddingRequests";

export async function recordUsage(
  accountId: Types.ObjectId,
  counter: UsageCounter,
) {
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
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
