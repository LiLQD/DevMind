import mongoose from "mongoose";

const accountSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: { type: String },
    emailVerifiedAt: { type: Date, select: false },
    identities: {
      google: { type: String, select: false },
      github: { type: String, select: false },
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ["user", "staff", "admin"],
      default: "user",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sessionVersion: { type: Number, default: 0, select: false },
  },
  { timestamps: true },
);

accountSchema.index(
  { "identities.google": 1 },
  {
    unique: true,
    partialFilterExpression: { "identities.google": { $type: "string" } },
  },
);

accountSchema.index(
  { "identities.github": 1 },
  {
    unique: true,
    partialFilterExpression: { "identities.github": { $type: "string" } },
  },
);

const Account = mongoose.model("Account", accountSchema);
export default Account;
