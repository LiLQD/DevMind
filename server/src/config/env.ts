import dotenv from "dotenv";

dotenv.config();

const nodeEnv = process.env.NODE_ENV || "development";
const required = {
  MONGODB_URI: process.env.MONGODB_URI ?? "",
  REDIS_URL: process.env.REDIS_URL ?? "",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "",
};
const missingVariables = Object.entries(required)
  .filter(([, value]) => !value.trim())
  .map(([name]) => name);

if (missingVariables.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingVariables.join(", ")}`,
  );
}

const trustProxyValue = process.env.TRUST_PROXY;
if (trustProxyValue !== undefined && !/^\d+$/.test(trustProxyValue)) {
  throw new Error("TRUST_PROXY must be a non-negative integer");
}

export const env = {
  PORT: process.env.PORT || 8080,
  NODE_ENV: nodeEnv,
  MOCK_BILLING_ENABLED:
    (process.env.NODE_ENV === "development" &&
      process.env.ENABLE_MOCK_BILLING === "true") ||
    (process.env.NODE_ENV === "production" &&
      process.env.ENABLE_PRODUCTION_MOCK_BILLING === "true"),
  ...required,
  TRUST_PROXY:
    trustProxyValue === undefined
      ? nodeEnv === "production"
        ? 1
        : false
      : Number(trustProxyValue),
};
