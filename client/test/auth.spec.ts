import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  let signedIn = false;
  await page.route("**/api/auth/session", (route) =>
    signedIn
      ? route.fulfill({
          json: {
            sessionId: "test-session",
            user: { id: "developer", name: "Test Developer" },
          },
        })
      : route.fulfill({ status: 401, json: { code: "AUTH_REQUIRED" } }),
  );
  await page.route("**/api/auth/csrf?purpose=credentials", (route) =>
    route.fulfill({ json: { csrfToken: "test-proof" } }),
  );
  page.on("response", (response) => {
    if (
      response.url().endsWith("/api/auth/register") &&
      response.status() === 201
    )
      signedIn = true;
  });
});

async function fillCredentials(page: Page) {
  await page.getByLabel("Email").fill("developer@example.com");
  await page.getByLabel("Password").fill("test-password");
}

test("registration prevents duplicate submissions and succeeds on retry after a visible error", async ({
  page,
}) => {
  let attempts = 0;
  const firstResponse = Promise.withResolvers<void>();
  await page.route("**/api/auth/register", async (route) => {
    attempts += 1;
    expect(route.request().postDataJSON()).toEqual({
      name: "Test Developer",
      email: attempts === 1 ? "developer@example.com" : "new@example.com",
      password: "test-password",
    });
    if (attempts === 1) {
      await firstResponse.promise;
      await route.fulfill({
        status: 400,
        json: { message: "Email đã tồn tại" },
      });
    } else {
      await route.fulfill({
        status: 201,
        json: { user: { id: "developer", name: "Test Developer" } },
      });
    }
  });
  await page.route("**/api/**", (route) => {
    if (route.request().url().includes("/api/auth/")) return route.fallback();
    return route.fulfill({ json: [] });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Name").fill("Test Developer");
  await fillCredentials(page);
  const form = page.locator(".auth-form");
  const error = form.getByRole("alert");
  try {
    await form.evaluate((element: HTMLFormElement) => {
      element.requestSubmit();
      element.requestSubmit();
    });
    await expect(
      page.getByRole("button", { name: "Creating account…" }),
    ).toBeDisabled();
    await expect(form.getByRole("status")).toHaveText("Creating account…");
    await expect(
      page.getByRole("button", { name: "Back to sign in" }),
    ).toBeDisabled();
  } finally {
    firstResponse.resolve();
  }

  await expect(error).toBeVisible();
  await expect(error).toHaveText("An account with this email already exists.");
  const submit = page.getByRole("button", { name: "Create account" });
  await expect(submit).toBeEnabled();
  expect(attempts).toBe(1);
  await expect(page.getByLabel("Name")).toHaveValue("Test Developer");
  await expect(page.getByLabel("Email")).toHaveValue("developer@example.com");
  await expect(page.getByLabel("Password")).toHaveValue("test-password");

  await page.getByLabel("Email").fill("new@example.com");
  await expect(error).toBeEmpty();
  await submit.click();
  await expect(page.getByRole("status")).toContainText("Account created.");
  await expect(form).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("token"))).toBeNull();
  expect(attempts).toBe(2);
});

test("invalid credentials restore sign-in and switching modes clears the inline error", async ({
  page,
}) => {
  const response = Promise.withResolvers<void>();
  await page.route("**/api/auth/login", async (route) => {
    await response.promise;
    await route.fulfill({
      status: 401,
      json: { message: "Email hoặc mật khẩu không đúng" },
    });
  });

  await page.goto("/");
  await fillCredentials(page);
  const submit = page.getByRole("button", { name: "Sign in", exact: true });
  try {
    await submit.click();
    await expect(
      page.getByRole("button", { name: "Signing in…" }),
    ).toBeDisabled();
  } finally {
    response.resolve();
  }

  const error = page.getByRole("alert");
  await expect(error).toBeVisible();
  await expect(error).toHaveText("Email or password is incorrect.");
  await expect(submit).toBeEnabled();
  await expect(page.getByLabel("Email")).toHaveValue("developer@example.com");
  await expect(page.getByLabel("Password")).toHaveValue("test-password");
  await page.getByRole("button", { name: "Create an account" }).click();
  await expect(error).toBeEmpty();
});

for (const failure of [
  {
    kind: "network failure",
    message: "Unable to reach DevMind. Check your connection and try again.",
  },
  { kind: "HTTP 500", message: "Unable to sign in. Please try again." },
]) {
  test(`sign-in shows feedback after ${failure.kind}`, async ({ page }) => {
    await page.route("**/api/auth/login", (route) =>
      failure.kind === "network failure"
        ? route.abort("failed")
        : route.fulfill({
            status: 500,
            body: "<h1>Internal server error</h1>",
          }),
    );

    await page.goto("/");
    await fillCredentials(page);
    const submit = page.getByRole("button", { name: "Sign in", exact: true });
    await submit.click();

    const error = page.getByRole("alert");
    await expect(error).toBeVisible();
    await expect(error).toHaveText(failure.message);
    await expect(submit).toBeEnabled();
    await expect(page.getByLabel("Password")).toHaveValue("test-password");
  });
}

test("registration explains an invalid name and displays API validation feedback", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/auth/register", (route) => {
    attempts += 1;
    return route.fulfill({
      status: 422,
      json: { error: { message: "Check the email address." } },
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await fillCredentials(page);
  await page.getByLabel("Name").fill("   ");
  const submit = page.getByRole("button", { name: "Create account" });
  await submit.click();

  const error = page.getByRole("alert");
  await expect(error).toHaveText("Enter your name.");
  expect(attempts).toBe(0);
  await page.getByLabel("Name").fill("Test Developer");
  await submit.click();
  await expect(error).toHaveText("Check the email address.");
  await expect(submit).toBeEnabled();
  expect(attempts).toBe(1);
});

test("requests a verification email before collecting a password and finishes from the link", async ({
  page,
}) => {
  const token = "a".repeat(43);
  await page.route("**/api/auth/register/status", (route) =>
    route.fulfill({ json: { emailVerificationRequired: true } }),
  );
  await page.route("**/api/auth/register/email", (route) => {
    expect(route.request().postDataJSON()).toEqual({
      email: "developer@example.com",
    });
    return route.fulfill({ status: 202, json: { accepted: true } });
  });
  await page.route("**/api/auth/register", (route) => {
    expect(route.request().postDataJSON()).toEqual({
      name: "Test Developer",
      password: "test-password",
      verificationToken: token,
    });
    return route.fulfill({
      status: 201,
      json: { user: { id: "developer", name: "Test Developer" } },
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  const send = page.getByRole("button", { name: "Send verification email" });
  await expect(send).toBeVisible();
  await expect(page.getByLabel("Password")).toHaveCount(0);
  await page.getByLabel("Email").fill("developer@example.com");
  await send.click();
  await expect(page.getByRole("status")).toContainText("check your inbox");
  await expect(
    page.getByRole("button", { name: "Resend verification email" }),
  ).toBeVisible();

  await page.goto(`/?from=email#verify-email=${token}`);
  await expect(
    page.getByRole("heading", { name: "Finish creating your account" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/\?from=email$/);
  await expect(page.getByLabel("Email")).toHaveCount(0);
  await page.getByLabel("Name").fill("Test Developer");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByRole("main", { name: "Notes workspace" }),
  ).toBeVisible();
});
