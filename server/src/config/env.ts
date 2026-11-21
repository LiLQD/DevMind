import dotenv from "dotenv";

dotenv.config();

const nodeEnv = process.env.NODE_ENV || "development";
const requiredVariables = [
  "MONGODB_URI",
  "REDIS_URL",
  "JWT_SECRET",
  "GEMINI_API_KEY",
] as const;
const missingVariables = requiredVariables.filter(
  (name) => !process.env[name]?.trim(),
);

if (missingVariables.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingVariables.join(", ")}`,
  );
}

const trustProxyValue = process.env.TRUST_PROXY;
if (trustProxyValue !== undefined && !/^\d+$/.test(trustProxyValue)) {
  throw new Error("TRUST_PROXY must be a non-negative integer");
}

const configuredOrigins = process.env.CORS_ORIGINS?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const env = {
  PORT: process.env.PORT || 8080,
  NODE_ENV: nodeEnv,
  MONGODB_URI: process.env.MONGODB_URI,
  REDIS_URL: process.env.REDIS_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  CORS_ORIGINS:
    configuredOrigins ||
    (nodeEnv === "production" ? [] : ["http://localhost:5173"]),
  TRUST_PROXY:
    trustProxyValue === undefined
      ? nodeEnv === "production"
        ? 1
        : false
      : Number(trustProxyValue),
};
