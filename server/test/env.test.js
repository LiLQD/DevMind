import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const required = {
  MONGODB_URI: "mongodb://test",
  REDIS_URL: "redis://test",
  JWT_SECRET: "test-secret",
  GEMINI_API_KEY: "test-key",
};
const envModule = new URL("../src/config/env.ts", import.meta.url).href;

function loadEnv(t, settings) {
  const cwd = mkdtempSync(join(tmpdir(), "devmind-env-test-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));

  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `const { env } = await import(${JSON.stringify(envModule)});
      console.log(JSON.stringify(env));`,
    ],
    {
      cwd,
      env: { DOTENV_CONFIG_QUIET: "true", ...settings },
      encoding: "utf8",
    },
  );
  assert.ifError(result.error);
  return result;
}

function readEnv(t, settings) {
  const { status, stdout, stderr } = loadEnv(t, settings);
  assert.equal(status, 0, stderr);
  return JSON.parse(stdout);
}

test("loads required settings and development defaults", (t) => {
  assert.deepEqual(readEnv(t, required), {
    ...required,
    PORT: 8080,
    NODE_ENV: "development",
    MOCK_BILLING_ENABLED: false,
    CORS_ORIGINS: ["http://localhost:5173"],
    TRUST_PROXY: false,
  });
});

test("mock billing requires an explicit development environment and opt-in", (t) => {
  for (const [settings, enabled] of [
    [{ ENABLE_MOCK_BILLING: "true" }, false],
    [{ NODE_ENV: "production", ENABLE_MOCK_BILLING: "true" }, false],
    [{ NODE_ENV: "test", ENABLE_MOCK_BILLING: "true" }, false],
    [{ NODE_ENV: "development", ENABLE_MOCK_BILLING: "1" }, false],
    [{ NODE_ENV: "development", ENABLE_MOCK_BILLING: "true" }, true],
  ]) {
    assert.equal(
      readEnv(t, { ...required, ...settings }).MOCK_BILLING_ENABLED,
      enabled,
    );
  }
});

test("uses production CORS and proxy defaults", (t) => {
  const config = readEnv(t, { ...required, NODE_ENV: "production" });
  assert.deepEqual(config.CORS_ORIGINS, []);
  assert.equal(config.TRUST_PROXY, 1);
});

test("parses explicit CORS origins and preserves a zero proxy hop count", (t) => {
  const config = readEnv(t, {
    ...required,
    PORT: "5000",
    CORS_ORIGINS: " https://one.example, , https://two.example ",
    TRUST_PROXY: "0",
    JWT_SECRET: " secret with spaces ",
  });
  assert.equal(config.PORT, "5000");
  assert.deepEqual(config.CORS_ORIGINS, [
    "https://one.example",
    "https://two.example",
  ]);
  assert.equal(config.TRUST_PROXY, 0);
  assert.equal(config.JWT_SECRET, " secret with spaces ");
});

test("reports absent and blank required values together", (t) => {
  const result = loadEnv(t, {
    REDIS_URL: "   ",
    JWT_SECRET: required.JWT_SECRET,
    GEMINI_API_KEY: required.GEMINI_API_KEY,
  });
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /Missing required environment variables: MONGODB_URI, REDIS_URL\n/,
  );
});

test("rejects a negative proxy hop count", (t) => {
  const result = loadEnv(t, { ...required, TRUST_PROXY: "-1" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /TRUST_PROXY must be a non-negative integer/);
});
