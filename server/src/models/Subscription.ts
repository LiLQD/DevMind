import mongoose from "mongoose";
import type { InferSchemaType } from "mongoose";
import { plans } from "../config/plans.ts";

const mockCheckoutSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    state: {
      type: String,
      enum: ["pending", "succeeded", "failed", "canceled"] as const,
      required: true,
    },
    revision: { type: Number, required: true },
    lastAction: String,
  },
  { _id: false },
);

export type MockCheckout = InferSchemaType<typeof mockCheckoutSchema>;

const subscriptionSchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      unique: true,
    },
    plan: {
      type: String,
      enum: Object.keys(plans),
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "past_due", "canceled", "trialing"] as const,
      required: true,
    },
    providerCustomerId: String,
    providerSubscriptionId: String,
    billingProvider: String,
    mockCheckout: mockCheckoutSchema,
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    cancelAtPeriodEnd: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export default mongoose.model("Subscription", subscriptionSchema);
