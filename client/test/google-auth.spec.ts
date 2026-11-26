import { expect, test, type Page } from "@playwright/test";

const provider = "https://accounts.google.com/o/oauth2/v2/auth";
const signIn = "/api/auth/google/finish-sign-in";

async function mockGoogle(
  page: Page,
  options: { signedIn?: boolean; failure?: boolean } = {},
) {
  let active = options.signedIn ?? false;
  let linked = false;
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    switch (url.pathname) {
      case "/api/auth/google/status":
        return route.fulfill({ json: { enabled: true } });
      case "/api/auth/session":
        return active
          ? route.fulfill({
              json: {
                sessionId: "test-session",
                user: { id: "user-id", email: "google@example.test" },
              },
            })
          : route.fulfill({ status: 401, json: { code: "AUTH_REQUIRED" } });
      case "/api/auth/csrf":
        return route.fulfill({
          json: {
            csrfToken: url.search
              ? "credential-proof"
              : "test-session.9999999999.proof",
          },
        });
      case "/api/auth/google/sign-in":
      case "/api/auth/google/connect":
        return route.fulfill({
          json: { url: provider + (active ? "?mode=connect" : "") },
        });
      case signIn:
        if (options.failure)
          return route.fulfill({
            status: 409,
            json: {
              code: "GOOGLE_EMAIL_IN_USE",
              message:
                "Sign in using your existing method, then connect Google from Sign-in methods.",
            },
          });
        active = true;
        return route.fulfill({ json: {} });
      case "/api/auth/google/finish-connect":
        linked = true;
        return route.fulfill({ json: { googleConnected: true } });
      case "/api/auth/methods":
        return route.fulfill({
          json: { passwordConfigured: true, googleConnected: linked },
        });
      case "/api/subscription":
        return route.fulfill({ json: { plan: "free", entitlements: {} } });
      default:
        return route.fulfill({ json: [] });
    }
  });
  await page.route("https://accounts.google.com/**", (route) => {
    const mode = new URL(route.request().url()).searchParams.has("mode")
      ? "connect"
      : "sign-in";
    return route.fulfill({
      status: 303,
      headers: { Location: `http://127.0.0.1:4173/?google=${mode}` },
    });
  });
}

test("completes Google sign-in through the standard cookie session and restores it on reload", async ({
  page,
}) => {
  await mockGoogle(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(
    page.getByRole("main", { name: "Notes workspace" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/\s*$/);
  await page.reload();
  await expect(
    page.getByRole("main", { name: "Notes workspace" }),
  ).toBeVisible();
});

test("keeps a Google collision actionable and leaves password authentication available", async ({
  page,
}) => {
  await mockGoogle(page, { failure: true });
  await page.goto("/");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Sign in using your existing method",
  );
  await expect(page.getByLabel("Password")).toBeEditable();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeEnabled();
});

test("connects Google through explicit account menu consent and preserves the existing session", async ({
  page,
}) => {
  await mockGoogle(page, { signedIn: true });
  await page.goto("/");
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign-in methods" }).click();
  const dialog = page.getByRole("dialog", { name: "Sign-in methods" });
  await expect(dialog.getByText("Password configured")).toBeVisible();
  await expect(dialog.getByText("Google not connected")).toBeVisible();
  await dialog.getByRole("button", { name: "Connect Google" }).click();
  await expect(
    dialog.getByText("Google connected", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(
    page.getByRole("main", { name: "Notes workspace" }),
  ).toBeVisible();
});

test("reports cancellation and hides Google when disabled", async ({
  page,
}) => {
  await mockGoogle(page);
  await page.route("**/api/auth/google/status", (route) =>
    route.fulfill({ json: { enabled: false } }),
  );
  await page.goto("/?google=cancelled");
  await expect(page.getByRole("alert")).toContainText(
    "Google sign-in was cancelled",
  );
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toHaveCount(0);
});
