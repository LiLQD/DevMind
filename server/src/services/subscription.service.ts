import type { Types } from "mongoose";
import { plans } from "../config/plans.ts";
import type { Plan } from "../config/plans.ts";
import Subscription from "../models/Subscription.ts";

export async function getAccountSubscription(accountId: Types.ObjectId) {
  const subscription = await Subscription.findOne({ accountId })
    .select("plan status currentPeriodEnd cancelAtPeriodEnd")
    .lean();
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
