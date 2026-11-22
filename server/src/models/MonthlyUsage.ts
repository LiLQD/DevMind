import mongoose from "mongoose";

const monthlyUsageSchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    monthStart: { type: Date, required: true },
    semanticSearchRequests: { type: Number, default: 0 },
    noteEmbeddingRequests: { type: Number, default: 0 },
  },
  { timestamps: true },
);

monthlyUsageSchema.index({ accountId: 1, monthStart: 1 }, { unique: true });

export default mongoose.model("MonthlyUsage", monthlyUsageSchema);
