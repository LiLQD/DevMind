import mongoose from "mongoose";

const authSessionSchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    accountVersion: { type: Number, required: true },
    currentTokenHash: { type: String, required: true, select: false },
    consumedTokenHashes: { type: [String], select: false },
    generation: { type: Number, default: 0 },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    rotatedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    revocationReason: { type: String, enum: ["logout", "reuse"] },
  },
  { writeConcern: { w: "majority" } },
);

authSessionSchema.index({ currentTokenHash: 1 }, { unique: true });
authSessionSchema.index({ consumedTokenHashes: 1 });
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("AuthSession", authSessionSchema);
