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

const suggestionTimeout = Number(
  process.env.GEMINI_SUGGESTION_TIMEOUT_MS ?? 10_000,
);
if (
  !Number.isSafeInteger(suggestionTimeout) ||
  suggestionTimeout < 1 ||
  suggestionTimeout > 30_000
) {
  throw new Error(
    "GEMINI_SUGGESTION_TIMEOUT_MS must be an integer between 1 and 30000",
  );
}

export const env = {
  PORT: process.env.PORT || 8080,
  NODE_ENV: nodeEnv,
  MOCK_BILLING_ENABLED:
    (process.env.NODE_ENV === "development" &&
      process.env.ENABLE_MOCK_BILLING === "true") ||
    (process.env.NODE_ENV === "production" &&
      process.env.ENABLE_PRODUCTION_MOCK_BILLING === "true"),
  GEMINI_SUGGESTION_MODEL:
    process.env.GEMINI_SUGGESTION_MODEL?.trim() || "gemini-3.1-flash-lite",
  GEMINI_SUGGESTION_TIMEOUT_MS: suggestionTimeout,
  ...required,
  TRUST_PROXY:
    trustProxyValue === undefined
      ? nodeEnv === "production"
        ? 1
        : false
      : Number(trustProxyValue),
};
