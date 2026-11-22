import { randomUUID } from "node:crypto";
import type { InferSchemaType, Types } from "mongoose";
import Subscription from "../models/Subscription.ts";
import type { MockCheckout } from "../models/Subscription.ts";

const actions = [
  "succeed",
  "fail",
  "cancel_checkout",
  "renew",
  "cancel_subscription",
  "fail_renewal",
  "expire",
] as const;

type Action = (typeof actions)[number];
type SubscriptionRecord = InferSchemaType<typeof Subscription.schema>;
type EntitlementUpdate = Partial<
  Pick<
    SubscriptionRecord,
    | "plan"
    | "status"
    | "currentPeriodStart"
    | "currentPeriodEnd"
    | "cancelAtPeriodEnd"
  >
>;

export function isMockBillingAction(value: unknown): value is Action {
  return actions.some((action) => action === value);
}

function conflict() {
  return Object.assign(
    new Error("Checkout state has changed or the action is unavailable."),
    {
      status: 409,
      code: "MOCK_BILLING_CONFLICT",
    },
  );
}

function notFound() {
  return Object.assign(new Error("Checkout not found."), {
    status: 404,
    code: "NOT_FOUND",
  });
}

function publicCheckout({ id, state, revision }: MockCheckout) {
  return {
    id,
    state,
    revision,
    price: { amountCents: 500, currency: "USD", interval: "month" },
    message: "Simulated checkout. No money is charged.",
  } as const;
}

export async function startMockCheckout(accountId: Types.ObjectId) {
  await Subscription.init();
  let subscription = await Subscription.findOne({ accountId }).lean();
  const checkout = { id: randomUUID(), state: "pending", revision: 0 } as const;
  if (!subscription) {
    try {
      await Subscription.create({
        accountId,
        billingProvider: "mock",
        plan: "free",
        status: "canceled",
        mockCheckout: checkout,
      });
      return publicCheckout(checkout);
    } catch (error) {
      // A simultaneous start may have created this account's only record.
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== 11000
      ) {
        throw error;
      }
      subscription = await Subscription.findOne({ accountId }).lean();
    }
  }

  if (subscription?.billingProvider !== "mock") throw conflict();
  const previous = subscription.mockCheckout;
  if (previous?.state === "pending") return publicCheckout(previous);
  if (isPaid(subscription, new Date())) throw conflict();

  const updated = await Subscription.updateOne(
    {
      accountId,
      billingProvider: "mock",
      ...(previous
        ? {
            "mockCheckout.id": previous.id,
            "mockCheckout.revision": previous.revision,
          }
        : { "mockCheckout.id": { $exists: false } }),
    },
    { $set: { mockCheckout: checkout } },
  );

  if (updated.matchedCount === 1) return publicCheckout(checkout);

  const concurrent = await Subscription.findOne({
    accountId,
    billingProvider: "mock",
  }).lean();
  if (concurrent?.mockCheckout?.state === "pending")
    return publicCheckout(concurrent.mockCheckout);
  throw conflict();
}

function findCheckout(accountId: Types.ObjectId, id: string) {
  return Subscription.findOne({
    accountId,
    billingProvider: "mock",
    "mockCheckout.id": id,
  }).lean();
}

export async function getMockCheckout(accountId: Types.ObjectId, id: string) {
  const subscription = await findCheckout(accountId, id);
  if (!subscription?.mockCheckout) throw notFound();
  return publicCheckout(subscription.mockCheckout);
}

function isPaid(subscription: SubscriptionRecord, now: Date) {
  return (
    subscription.plan === "pro" &&
    (subscription.status === "active" || subscription.status === "trialing") &&
    !!subscription.currentPeriodEnd &&
    subscription.currentPeriodEnd > now
  );
}

function nextBillingMonth(date: Date) {
  const end = new Date(date);
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const lastDay = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
  ).getUTCDate();
  end.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return end;
}

function transition(
  subscription: SubscriptionRecord,
  checkout: MockCheckout,
  action: Action,
  now: Date,
): {
  state: MockCheckout["state"];
  entitlement?: EntitlementUpdate;
} {
  if (checkout.state === "pending") {
    switch (action) {
      case "succeed":
        return {
          state: "succeeded",
          entitlement: {
            plan: "pro",
            status: "active",
            cancelAtPeriodEnd: false,
            currentPeriodStart: now,
            currentPeriodEnd: nextBillingMonth(now),
          },
        };
      case "fail":
        return { state: "failed" };
      case "cancel_checkout":
        return { state: "canceled" };
      default:
        throw conflict();
    }
  }

  if (checkout.state !== "succeeded") throw conflict();
  const { currentPeriodEnd, cancelAtPeriodEnd, status } = subscription;
  const canRenew = isPaid(subscription, now) && !cancelAtPeriodEnd;
  switch (action) {
    case "renew":
      if (canRenew && currentPeriodEnd) {
        return {
          state: checkout.state,
          entitlement: { currentPeriodEnd: nextBillingMonth(currentPeriodEnd) },
        };
      }
      break;
    case "cancel_subscription":
      if (canRenew) {
        return {
          state: checkout.state,
          entitlement: { cancelAtPeriodEnd: true },
        };
      }
      break;
    case "fail_renewal":
      if (canRenew) {
        return { state: checkout.state, entitlement: { status: "past_due" } };
      }
      break;
    case "expire":
      if (status !== "canceled" && currentPeriodEnd) {
        return {
          state: checkout.state,
          entitlement: {
            status: "canceled",
            currentPeriodEnd: currentPeriodEnd < now ? currentPeriodEnd : now,
          },
        };
      }
      break;
  }
  throw conflict();
}

function isReplay(
  checkout: MockCheckout,
  action: Action,
  expectedRevision: number,
) {
  return (
    checkout.revision === expectedRevision + 1 && checkout.lastAction === action
  );
}

export async function applyMockBillingAction(
  accountId: Types.ObjectId,
  id: string,
  action: Action,
  expectedRevision: number,
) {
  const subscription = await findCheckout(accountId, id);
  const checkout = subscription?.mockCheckout;
  if (!checkout) throw notFound();
  if (isReplay(checkout, action, expectedRevision))
    return publicCheckout(checkout);
  if (checkout.revision !== expectedRevision) throw conflict();

  const { state, entitlement } = transition(
    subscription,
    checkout,
    action,
    new Date(),
  );
  const next = {
    id,
    state,
    revision: expectedRevision + 1,
    lastAction: action,
  };
  const updated = await Subscription.updateOne(
    {
      accountId,
      billingProvider: "mock",
      "mockCheckout.id": id,
      "mockCheckout.revision": expectedRevision,
    },
    { $set: { ...entitlement, mockCheckout: next } },
  );
  if (updated.matchedCount === 1) return publicCheckout(next);

  const concurrent = (await findCheckout(accountId, id))?.mockCheckout;
  if (concurrent && isReplay(concurrent, action, expectedRevision)) {
    return publicCheckout(concurrent);
  }
  throw conflict();
}
