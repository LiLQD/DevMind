import type { Types } from "mongoose";
import { env } from "../config/env.ts";
import { plans } from "../config/plans.ts";
import type { Plan } from "../config/plans.ts";
import Subscription from "../models/Subscription.ts";

export async function getAccountSubscription(accountId: Types.ObjectId) {
  const record = await Subscription.findOne({ accountId })
    .select("billingProvider plan status currentPeriodEnd cancelAtPeriodEnd")
    .lean();
  const subscription =
    record?.billingProvider === "mock" &&
    (!env.MOCK_BILLING_ENABLED || record.plan === "free")
      ? null
      : record;
  const now = new Date();
  const periodEnd = subscription?.currentPeriodEnd ?? null;
  const hasProAccess =
    subscription?.plan === "pro" &&
    (subscription.status === "active" || subscription.status === "trialing") &&
    periodEnd !== null &&
    periodEnd > now;
  const plan: Plan = hasProAccess ? "pro" : "free";

  return {
    plan,
    status: subscription?.status ?? null,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
    entitlements: plans[plan],
  };
}
