import mongoose from "mongoose";
import { plans } from "../config/plans.ts";

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
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    cancelAtPeriodEnd: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export default mongoose.model("Subscription", subscriptionSchema);
