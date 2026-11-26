import { expect, test, type Page } from "@playwright/test";

const collection = { id: "infra", name: "Infrastructure" };
const suggestions = { tags: ["redis", "rate limiting"], collection };
const suggestLabel = "Suggest tags & collection";

async function mockWorkspace(page: Page) {
  let session: string | null = "account-a";
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url());
    switch (path.pathname) {
      case "/api/auth/session":
        return session
          ? route.fulfill({
              json: {
                sessionId: session,
                user: { id: session, name: session },
              },
            })
          : route.fulfill({ status: 401, json: { code: "AUTH_REQUIRED" } });
      case "/api/auth/csrf":
        return route.fulfill({
          json: {
            csrfToken: path.search
              ? "credentials-proof"
              : `${session}.9999999999.proof`,
          },
        });
      case "/api/auth/logout":
        session = null;
        return route.fulfill({ status: 204 });
      case "/api/auth/login":
        session = "account-b";
        return route.fulfill({
          json: { user: { id: session, name: session } },
        });
      case "/api/subscription":
        return route.fulfill({
          json: { entitlements: { bulkMarkdownImport: false } },
        });
      case "/api/collections":
        return route.fulfill({
          json: [{ _id: collection.id, name: collection.name }],
        });
      case "/api/notes":
        if (route.request().method() === "POST") {
          const draft = route.request().postDataJSON();
          return route.fulfill({
            status: 201,
            json: {
              _id: "saved-note",
              ...draft,
              createdAt: "2026-01-01",
              embeddingStatus: "success",
            },
          });
        }
        return route.fulfill({ json: [] });
      default:
        return route.fulfill({ json: [] });
    }
  });
  await page.goto("/");
}

async function openDraft(page: Page, fillDraft = true) {
  await page
    .getByLabel("Browse notes")
    .getByRole("button", { name: "New note", exact: true })
    .click();
  if (fillDraft) {
    await page.locator("#note-title").fill("Redis note");
    await page
      .locator("#note-content")
      .fill("Redis counters expire too early.");
  }
}

test("suggests organization for an imported Markdown draft and applies choices individually", async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.route("**/api/notes/suggestions", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      title: "Redis troubleshooting",
      content: "# Redis troubleshooting\n\nCounter expiry fix",
    });
    await route.fulfill({ json: suggestions });
  });
  await openDraft(page, false);
  await page.locator('input[type="file"][accept=".md"]').setInputFiles({
    name: "Redis troubleshooting.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Redis troubleshooting\n\nCounter expiry fix"),
  });
  const tags = page.getByLabel("Tags");
  await tags.fill("manual");
  await page.getByRole("button", { name: suggestLabel }).click();
  const collectionField = page.getByLabel("Collection", { exact: true });
  await expect(
    page.getByRole("button", { name: "Apply collection: Infrastructure" }),
  ).toBeVisible();
  await expect(collectionField).toHaveValue("");
  await expect(tags).toHaveValue("manual");
  await page.getByRole("button", { name: "Add tag: redis" }).click();
  await expect(tags).toHaveValue("manual, redis");
  await page.getByRole("button", { name: "Dismiss tag rate limiting" }).click();
  await expect(
    page.getByRole("button", { name: "Add tag: rate limiting" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Apply collection: Infrastructure" })
    .click();
  await expect(collectionField).toHaveValue("infra");
});

test("discards a stale response after an edit and leaves saving available during generation and after failure", async ({
  page,
}) => {
  await mockWorkspace(page);
  const release = Promise.withResolvers<void>();
  let attempts = 0;
  await page.route("**/api/notes/suggestions", async (route) => {
    if (++attempts === 1) {
      await release.promise;
      return route.fulfill({ json: suggestions });
    }
    return route.fulfill({
      status: 504,
      json: { message: "Suggestions timed out. Try again when ready." },
    });
  });
  try {
    await openDraft(page);
    const button = page.getByRole("button", { name: suggestLabel });
    await button.click();
    await expect(
      page.getByRole("button", { name: "Generating suggestions…" }),
    ).toBeDisabled();
    const save = page.getByRole("button", { name: "Save note", exact: true });
    await expect(save).toBeEnabled();
    await page.locator("#note-content").fill("New draft about Git.");
    release.resolve();
    await expect(button).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Add tag: redis" }),
    ).toHaveCount(0);
    await button.click();
    await expect(page.getByRole("alert")).toHaveText(
      "Suggestions timed out. Try again when ready.",
    );
    await expect(button).toBeEnabled();
    const saved = page.waitForRequest(
      (req) =>
        new URL(req.url()).pathname === "/api/notes" && req.method() === "POST",
    );
    await save.click();
    expect((await saved).postDataJSON().content).toBe("New draft about Git.");
    await expect(
      page.getByText("Note created.", { exact: true }),
    ).toBeVisible();
  } finally {
    release.resolve();
  }
});

test("discards a response from the previous account after switching sessions", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const request = window.fetch.bind(window);
    window.fetch = (input, options) =>
      String(input).endsWith("/notes/suggestions")
        ? request(input, { ...options, signal: undefined })
        : request(input, options);
  });
  await mockWorkspace(page);
  const release = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  await page.route("**/api/notes/suggestions", async (route) => {
    if (route.request().headers()["x-devmind-session"] === "account-a") {
      started.resolve();
      await release.promise;
      return route.fulfill({ json: suggestions });
    }
    return route.fulfill({ json: { tags: ["git"], collection: null } });
  });
  try {
    await openDraft(page);
    await page.getByRole("button", { name: suggestLabel }).click();
    await started.promise;
    await page.getByRole("button", { name: "Logout" }).click();
    await page.getByRole("button", { name: "Discard changes" }).click();
    await page.getByLabel("Email").fill("b@example.test");
    await page.getByLabel("Password").fill("example-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await openDraft(page);
    await page.getByRole("button", { name: suggestLabel }).click();
    await expect(
      page.getByRole("button", { name: "Add tag: git" }),
    ).toBeVisible();
    const finished = page.waitForEvent(
      "requestfinished",
      (req) =>
        req.url().endsWith("/notes/suggestions") &&
        req.headers()["x-devmind-session"] === "account-a",
    );
    release.resolve();
    await finished;
    await expect(
      page.getByRole("button", { name: "Add tag: git" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add tag: redis" }),
    ).toHaveCount(0);
  } finally {
    release.resolve();
  }
});
