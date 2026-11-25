const input = process.argv[2];
let origin;
try {
  const url = new URL(input);
  if (
    process.argv.length !== 3 ||
    !["http:", "https:"].includes(url.protocol) ||
    (url.protocol === "http:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error();
  }
  origin = url.origin;
} catch {
  console.error(
    "Usage: node server/scripts/deployment-smoke.mjs <frontend-origin>",
  );
  process.exit(2);
}

const checks = [
  ["/api/health", 200, (body) => body?.status === "OK"],
  [
    "/api/ready",
    200,
    (body) =>
      body?.status === "READY" &&
      body.checks?.database === true &&
      body.checks?.redis === true,
  ],
  ["/api/auth/session", 401, (body) => body?.code === "AUTH_REQUIRED"],
];

for (const [path, status, matches] of checks) {
  try {
    const response = await fetch(new URL(path, origin), {
      redirect: "manual",
      signal: AbortSignal.timeout(55_000),
      headers: { Accept: "application/json" },
    });
    if (response.status >= 300 && response.status < 400) {
      throw new Error(`unexpected redirect (HTTP ${response.status})`);
    }
    if (response.status !== status) {
      throw new Error(`expected HTTP ${status}, got ${response.status}`);
    }
    const contentType = response.headers.get("content-type");
    if (
      contentType?.split(";")[0].trim().toLowerCase() !== "application/json"
    ) {
      throw new Error("expected application/json");
    }
    const cacheControl = response.headers.get("cache-control") ?? "";
    const directives = cacheControl
      .toLowerCase()
      .split(",")
      .map((part) => part.trim());
    if (!directives.includes("no-store") || directives.includes("public")) {
      throw new Error(
        "expected Cache-Control: no-store without public caching",
      );
    }
    const cacheStatus = response.headers.get("x-vercel-cache");
    const age = Number(response.headers.get("age"));
    if (age > 0 || /^(HIT|STALE|REVALIDATED)$/i.test(cacheStatus ?? "")) {
      throw new Error(
        "response appears to have been served from a shared cache",
      );
    }
    const body = await response.json().catch(() => {
      throw new Error("invalid JSON response");
    });
    if (!matches(body)) throw new Error("unexpected JSON response");
    console.log(`PASS ${path} HTTP ${status}`);
  } catch (error) {
    console.error(`FAIL ${path} ${error.message}`);
    process.exitCode = 1;
  }
}
