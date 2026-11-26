import { expect, test, type Page } from "@playwright/test";

const providers = [
  {
    key: "google",
    name: "Google",
    url: "https://accounts.google.com/o/oauth2/v2/auth",
  },
  {
    key: "github",
    name: "GitHub",
    url: "https://github.com/login/oauth/authorize",
  },
] as const;

async function mockProvider(
  page: Page,
  provider: (typeof providers)[number],
  options: { signedIn?: boolean; failure?: boolean } = {},
) {
  const base = `/api/auth/${provider.key}`;
  const connected = `${provider.key}Connected`;
  let active = options.signedIn ?? false;
  let linked = false;
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    switch (url.pathname) {
      case base + "/status":
        return route.fulfill({ json: { enabled: true } });
      case "/api/auth/session":
        return active
          ? route.fulfill({
              json: {
                sessionId: "test-session",
                user: { id: "user-id", email: `${provider.key}@example.test` },
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
      case base + "/sign-in":
      case base + "/connect":
        return route.fulfill({
          json: { url: provider.url + (active ? "?mode=connect" : "") },
        });
      case base + "/finish-sign-in":
        if (options.failure)
          return route.fulfill({
            status: 409,
            json: {
              code: `${provider.key.toUpperCase()}_EMAIL_IN_USE`,
              message: `Sign in using your existing method, then connect ${provider.name} from Sign-in methods.`,
            },
          });
        active = true;
        return route.fulfill({ json: {} });
      case base + "/finish-connect":
        linked = true;
        return route.fulfill({ json: { [connected]: true } });
      case "/api/auth/methods":
        return route.fulfill({
          json: { passwordConfigured: true, [connected]: linked },
        });
      case "/api/subscription":
        return route.fulfill({ json: { plan: "free", entitlements: {} } });
      default:
        return route.fulfill({ json: [] });
    }
  });
  await page.route(provider.url + "**", (route) => {
    const mode = new URL(route.request().url()).searchParams.has("mode")
      ? "connect"
      : "sign-in";
    return route.fulfill({
      status: 303,
      headers: { Location: `http://127.0.0.1:4173/?${provider.key}=${mode}` },
    });
  });
}

for (const provider of providers) {
  test(`completes ${provider.name} sign-in through the standard cookie session and restores it on reload`, async ({
    page,
  }) => {
    await mockProvider(page, provider);
    await page.goto("/");
    await page
      .getByRole("button", { name: `Continue with ${provider.name}` })
      .click();
    await expect(
      page.getByRole("main", { name: "Notes workspace" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/\s*$/);
    await page.reload();
    await expect(
      page.getByRole("main", { name: "Notes workspace" }),
    ).toBeVisible();
  });

  test(`keeps a ${provider.name} collision actionable and leaves password authentication available`, async ({
    page,
  }) => {
    await mockProvider(page, provider, { failure: true });
    await page.goto("/");
    await page
      .getByRole("button", { name: `Continue with ${provider.name}` })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "Sign in using your existing method",
    );
    await expect(page.getByLabel("Password")).toBeEditable();
    await expect(
      page.getByRole("button", { name: `Continue with ${provider.name}` }),
    ).toBeEnabled();
  });

  test(`connects ${provider.name} through explicit account menu consent and preserves the existing session`, async ({
    page,
  }) => {
    await mockProvider(page, provider, { signedIn: true });
    await page.goto("/");
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("button", { name: "Sign-in methods" }).click();
    const dialog = page.getByRole("dialog", { name: "Sign-in methods" });
    await expect(dialog.getByText("Password configured")).toBeVisible();
    await expect(
      dialog.getByText(`${provider.name} not connected`),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: `Connect ${provider.name}` })
      .click();
    await expect(
      dialog.getByText(`${provider.name} connected`, { exact: true }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(
      page.getByRole("main", { name: "Notes workspace" }),
    ).toBeVisible();
  });

  test(`reports cancellation and hides ${provider.name} when disabled`, async ({
    page,
  }) => {
    await mockProvider(page, provider);
    await page.route(`**/api/auth/${provider.key}/status`, (route) =>
      route.fulfill({ json: { enabled: false } }),
    );
    await page.goto(`/?${provider.key}=cancelled`);
    await expect(page.getByRole("alert")).toContainText(
      `${provider.name} sign-in was cancelled`,
    );
    await expect(
      page.getByRole("button", { name: `Continue with ${provider.name}` }),
    ).toHaveCount(0);
  });
}
