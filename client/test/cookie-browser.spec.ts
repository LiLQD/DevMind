import { fork } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { createServer } from "vite";
import type { ViteDevServer } from "vite";

const mongoUri = process.env.COOKIE_BROWSER_TEST_MONGODB_URI;
const origin = "http://127.0.0.1:4180";
const accessCookie = "devmind-access";
const refreshCookie = "devmind-refresh";

test.skip(
  !mongoUri && !process.env.CI,
  "Set COOKIE_BROWSER_TEST_MONGODB_URI to run against disposable MongoDB",
);

let backend: ChildProcess;
let frontend: ViteDevServer;

test.beforeAll(async () => {
  if (!mongoUri) throw new Error("CI requires COOKIE_BROWSER_TEST_MONGODB_URI");
  const serverDirectory = fileURLToPath(
    new URL("../../server/", import.meta.url),
  );
  backend = fork("test-support/cookie-browser-server.js", {
    cwd: serverDirectory,
    execArgv: ["--experimental-test-module-mocks"],
    stdio: ["ignore", "ignore", "inherit", "ipc"],
    env: {
      ...process.env,
      NODE_ENV: "test",
      MONGODB_URI: mongoUri,
      REDIS_URL: "redis://cookie-browser-test",
      GEMINI_API_KEY: "synthetic-browser-test",
      JWT_SECRET: "synthetic-legacy-key",
      ENABLE_COOKIE_AUTH: "true",
      COOKIE_AUTH_ORIGINS: origin,
      COOKIE_AUTH_JWT_SECRET: "synthetic-cookie-jwt-secret-for-browser-tests",
      COOKIE_AUTH_CSRF_SECRET: "synthetic-cookie-csrf-secret-for-browser-tests",
      COOKIE_BROWSER_TEST_DATABASE: `devmind_browser_${randomUUID()}`,
    },
  });
  const port = await new Promise<number>((resolve, reject) => {
    backend.once("message", (message: { port: number }) =>
      resolve(message.port),
    );
    backend.once("error", reject);
    backend.once("exit", (code) =>
      reject(new Error(`Cookie test backend exited with code ${code}.`)),
    );
  });

  const previousOrigin = process.env.DEVMIND_DEV_API_ORIGIN;
  process.env.DEVMIND_DEV_API_ORIGIN = `http://127.0.0.1:${port}`;
  try {
    frontend = await createServer({
      define: { "import.meta.env.VITE_ENABLE_COOKIE_AUTH": '"true"' },
      server: { host: "127.0.0.1", port: 4180, strictPort: true },
    });
  } finally {
    if (previousOrigin === undefined) delete process.env.DEVMIND_DEV_API_ORIGIN;
    else process.env.DEVMIND_DEV_API_ORIGIN = previousOrigin;
  }
  await frontend.listen();
});

test.afterAll(async () => {
  try {
    await frontend?.close();
  } finally {
    if (backend?.connected) {
      const exited = once(backend, "exit");
      backend.disconnect();
      await exited;
    }
  }
});

async function register(page: Page, name = "Cookie User") {
  const email = `${randomUUID()}@example.test`;
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("browser-test-password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  return email;
}

async function signIn(page: Page, email: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("browser-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "New note", exact: true }).first(),
  ).toBeVisible();
}

async function draft(page: Page) {
  await page
    .getByRole("button", { name: "New note", exact: true })
    .first()
    .click();
  await page.getByLabel("Title", { exact: true }).fill("Unfinished note");
  await page.getByLabel("Content (Markdown)").fill("Preserve this draft.");
}

async function expireAccess(context: BrowserContext) {
  await context.clearCookies({ name: accessCookie });
}

test("restores on reload and retries a note save rejected before side effects", async ({
  page,
  context,
}) => {
  await page.goto(origin);
  await register(page);
  await expect
    .poll(async () =>
      (await context.cookies(origin))
        .filter(({ name }) => [accessCookie, refreshCookie].includes(name))
        .map(({ httpOnly }) => httpOnly),
    )
    .toEqual([true, true]);
  expect(await page.evaluate(() => localStorage.getItem("token"))).toBeNull();
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    "devmind-refresh",
  );

  await page.reload();
  await expect(page.getByText("Cookie User", { exact: true })).toBeVisible();
  await draft(page);
  await expireAccess(context);
  const refresh = page.waitForResponse((response) =>
    response.url().endsWith("/api/auth/refresh"),
  );
  await page.getByRole("button", { name: "Save note" }).click();
  expect((await refresh).status()).toBe(204);
  await expect(
    page.getByRole("heading", { name: "Unfinished note" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Unfinished note", exact: true }),
  ).toHaveCount(1);
});

test("two tabs share one refresh and logout updates both", async ({
  page,
  context,
}) => {
  await page.goto(origin);
  await register(page);
  const other = await context.newPage();
  await other.goto(origin);
  await expect(other.getByText("Cookie User", { exact: true })).toBeVisible();
  let refreshes = 0;
  context.on("request", (request) => {
    if (request.url().endsWith("/api/auth/refresh")) refreshes++;
  });

  await expireAccess(context);
  await Promise.all(
    [page, other].map(async (tab) => {
      await tab.getByRole("button", { name: "Export Markdown" }).click();
      await expect(tab.getByText("No notes to export.")).toBeVisible();
    }),
  );
  expect(refreshes).toBe(1);

  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(other.getByRole("heading", { name: "Sign in" })).toBeVisible();
  expect((await context.cookies(origin)).map(({ name }) => name)).not.toContain(
    refreshCookie,
  );
});

test("a lost refresh response requires same-account sign-in when successor cookies are lost", async ({
  page,
  context,
}) => {
  await page.goto(origin);
  const email = await register(page);
  await draft(page);
  const old = (await context.cookies(origin)).filter(
    ({ name }) => name === refreshCookie,
  );
  await expireAccess(context);
  let refreshes = 0;
  await page.route("**/api/auth/refresh", async (route) => {
    refreshes++;
    const response = await route.fetch();
    expect(response.status()).toBe(204);
    await expireAccess(context);
    await context.addCookies(old);
    await route.abort();
  });
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  expect(refreshes).toBe(1);
  await signIn(page, email);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Unfinished note",
  );
  await expect(page.getByLabel("Content (Markdown)")).toHaveValue(
    "Preserve this draft.",
  );
});

test("signing into another account keeps the old draft and workspace out of view", async ({
  page,
  context,
}) => {
  await page.goto(origin);
  await register(page, "Account A");
  await draft(page);
  const other = await context.newPage();
  await other.goto(origin);
  await other.getByRole("button", { name: "Logout" }).click();
  const emailB = await register(other, "Account B");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText("Preserve this draft.")).toHaveCount(0);

  await signIn(page, emailB);
  await expect(page.getByText("Account B", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "New note", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Title", { exact: true })).toBeEmpty();
});

test("continues after a lost refresh response when the browser received the successor cookies", async ({
  page,
  context,
}) => {
  await page.goto(origin);
  await register(page);
  await page.evaluate(() => {
    const browserFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const response = await browserFetch(input, init);
      if (input === "/api/auth/refresh") {
        // The browser has already processed the real response headers.
        throw new TypeError("Simulated lost application response");
      }
      return response;
    };
  });
  await expireAccess(context);
  await page.getByRole("button", { name: "Export Markdown" }).click();
  await expect(page.getByText("No notes to export.")).toBeVisible();
  await expect(page.getByText("Cookie User", { exact: true })).toBeVisible();
});

test("does not replay an unconfirmed note write", async ({ page }) => {
  await page.goto(origin);
  await register(page);
  await draft(page);
  let writes = 0;
  await page.route("**/api/notes", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    writes++;
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    await route.abort();
  });

  await page.getByRole("button", { name: "Save note" }).click();
  await expect(
    page.getByText(
      "Unable to reach DevMind. Check your connection and try again.",
    ),
  ).toBeVisible();
  expect(writes).toBe(1);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Unfinished note",
  );
});

test("restores an existing session after a temporary API outage", async ({
  page,
}) => {
  await page.goto(origin);
  await register(page);
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 503, json: { code: "SESSION_UNAVAILABLE" } }),
  );

  await page.reload();
  await expect(page.getByRole("alert")).toHaveText(
    "Could not restore your session.",
  );
  await expect(
    page.getByRole("button", { name: "New note", exact: true }),
  ).toHaveCount(0);

  await page.unroute("**/api/auth/session");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("Cookie User", { exact: true })).toBeVisible();
});

test("keeps the workspace locked until sign-out can be confirmed", async ({
  page,
  context,
}) => {
  await page.goto(origin);
  await register(page);
  await page.route("**/api/auth/logout", (route) => route.abort(), {
    times: 1,
  });

  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Could not confirm sign-out.",
  );
  await expect(
    page.getByRole("button", { name: "New note", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  expect((await context.cookies(origin)).map(({ name }) => name)).not.toContain(
    refreshCookie,
  );
});
