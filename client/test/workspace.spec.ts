import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";

const collections = [
  { _id: "system", name: "System Design" },
  { _id: "backend", name: "Backend" },
  { _id: "frontend", name: "Frontend" },
  { _id: "devops", name: "DevOps" },
  { _id: "personal", name: "Personal" },
];
const source = [
  "A practical guide to system design, covering core principles, a step-by-step process, and patterns for building reliable, maintainable systems.",
  "## 1. Core Principles",
  "Before diving into specific design choices, it’s important to keep a few core principles in mind:",
  "- **Scalability** — Handle growth in users, data, and traffic.\n- **Reliability** — Keep the system available and fault-tolerant.\n- **Maintainability** — Make it easy to evolve and operate over time.\n- **Cost efficiency** — Meet requirements within the budget.",
  "## 2. A Step-by-Step Process",
  "1. **Clarify requirements**\n2. **Estimate scale**\n3. **Design the high-level architecture**\n4. **Dive into key components**\n5. **Review trade-offs and risks**",
  "> Ưu tiên độ tin cậy và khả năng vận hành.",
  "| Distributed architecture component | Operational reliability and throughput guidance |\n| --- | --- |\n| Redis | Use a bounded cache with an explicit expiry policy and instrumentation. |",
  "- [x] Estimate traffic\n- [ ] Verify failover",
  '```js\nconst cacheKey = "' + "very-long-key-".repeat(16) + '";\n```',
].join("\n\n");
const seed = [
  {
    _id: "main",
    title: "System Design: A Practical Guide",
    content: source,
    collections: [collections[0]],
    tags: [
      { _id: "scaling", name: "scalability" },
      { _id: "architecture", name: "architecture" },
    ],
  },
  {
    _id: "api",
    title: "Building a RESTful API with Node.js",
    content:
      "A clean, production-ready setup with Express, validation, and error handling.",
    collections: [collections[1]],
    tags: [],
  },
  {
    _id: "index",
    title: "Database Indexing Best Practices",
    content:
      "How indexes work, when to use them, and common performance pitfalls.",
    collections: [collections[1]],
    tags: [],
  },
  {
    _id: "ci",
    title: "CI/CD for Modern Web Apps",
    content:
      "A practical workflow with GitHub Actions for reliable deployments.",
    collections: [collections[3]],
    tags: [],
  },
  {
    _id: "react",
    title: "React Performance Optimization",
    content: "Techniques to reduce re-renders and improve performance.",
    collections: [collections[2]],
    tags: [],
  },
].map((note) => ({
  ...note,
  createdAt: "2026-01-10T09:00:00Z",
  updatedAt: "2026-01-20T10:24:00Z",
  embeddingStatus: "success",
}));

async function mockWorkspace(page: Page, plan: "free" | "pro" = "free") {
  let notes = structuredClone(seed);
  const requests: string[] = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const path = url.pathname;
    requests.push(method + " " + path);
    const reply = (json: unknown, status = 200) =>
      route.fulfill({ json, status });
    if (path === "/api/auth/session")
      return reply({
        sessionId: "workspace",
        user: {
          id: "workspace-user",
          name: "Lưu Quang Dũng",
          email: "workspace@example.test",
        },
      });
    if (path === "/api/auth/csrf")
      return reply({ csrfToken: "workspace.9999999999.proof" });
    if (path === "/api/subscription")
      return reply({
        plan,
        entitlements: { bulkMarkdownImport: plan === "pro" },
        usage: {
          semanticSearchRequests: 0,
          noteEmbeddingRequests: 0,
          resetAt: "2026-12-01T00:00:00Z",
        },
      });
    if (path === "/api/collections") return reply(collections);
    if (path === "/api/notes/search") return reply({ results: [notes[0]] });
    if (path === "/api/notes/import")
      return reply({
        results: route
          .request()
          .postDataJSON()
          .notes.map(({ key }: { key: string }, index: number) => ({
            index,
            key,
            status: "saved",
            embeddingStatus: "success",
            noteId: "imported",
          })),
      });
    if (path === "/api/notes") {
      if (method === "POST") {
        const note = {
          ...seed[0],
          ...route.request().postDataJSON(),
          _id: "created",
          tags: [],
          collections: [],
        };
        notes = [...notes, note];
        return reply(note, 201);
      }
      const collectionId = url.searchParams.get("collectionId");
      return reply(
        collectionId
          ? notes.filter((note) =>
              note.collections.some(({ _id }) => _id === collectionId),
            )
          : notes,
      );
    }
    if (path.startsWith("/api/notes/")) {
      const id = path.split("/").at(-1);
      const note = notes.find(({ _id }) => _id === id);
      if (method === "DELETE") {
        notes = notes.filter(({ _id }) => _id !== id);
        return reply({});
      }
      return note
        ? reply({ ...note, relatedNotes: notes.slice(1, 4) })
        : reply({}, 404);
    }
    return route.abort();
  });
  await page.goto("/");
  return requests;
}

const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const openNote = (page: Page) => button(page, seed[0].title).click();
const captureDir = process.env.DEVMIND_WORKSPACE_SCREENSHOTS;

test("collapses panels independently and restores the exact layout and draft after focus mode", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await mockWorkspace(page);
  await openNote(page);
  await expect(
    page.getByRole("complementary", { name: "Note details" }),
  ).toBeVisible();
  await button(page, "Collapse navigation").click();
  await expect(button(page, "Account menu")).toBeVisible();
  await button(page, "Collapse note list").click();
  await expect(
    page.getByRole("complementary", { name: "Browse notes" }),
  ).toBeHidden();
  await button(page, "Collapse note details").click();
  await button(page, "Focus mode").click();
  await button(page, "More note actions").click();
  await page.keyboard.press("Escape");
  await expect(button(page, "Exit focus mode")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(button(page, "Focus mode")).toBeFocused();
  await expect(button(page, "Show navigation")).toBeVisible();
  await expect(button(page, "Show note list")).toBeVisible();
  await expect(button(page, "Show note details")).toBeVisible();
  await button(page, "Show navigation").click();
  await button(page, "Show note list").click();
  await button(page, "Show note details").click();
  await expect(
    page.getByRole("complementary", { name: "Note details" }),
  ).toBeVisible();
  await button(page, "Edit").click();
  await page.locator("#note-content").fill("Unsaved draft remains.");
  const original = await page.locator("#note-content").elementHandle();
  await button(page, "Focus mode").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#note-content")).toHaveValue(
    "Unsaved draft remains.",
  );
  expect(await original?.evaluate((element) => element.isConnected)).toBe(true);
  await button(page, "Collapse note list").click();
  await page.reload();
  await expect(button(page, "Collapse navigation")).toBeVisible();
  await expect(button(page, "Show note list")).toBeVisible();
});

test("handles account keyboard navigation, placeholders, search, collection filtering and note deletion", async ({
  page,
}) => {
  const requests = await mockWorkspace(page);
  await openNote(page);
  await expect(button(page, "Share, coming soon")).toBeDisabled();
  await expect(button(page, "Favorites, coming soon")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Favorite, coming soon" }).first(),
  ).toBeDisabled();
  const trigger = button(page, "Account menu");
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: /Appearance/ })).toBeFocused();
  await expect(button(page, "Language")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await button(page, "Appearance").click();
  await expect(button(page, "Light")).toHaveAttribute("aria-pressed", "true");
  await button(page, "Dark").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(button(page, "Dark")).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await trigger.click();
  await button(page, "Appearance").click();
  await expect(button(page, "Dark")).toHaveAttribute("aria-pressed", "true");
  await button(page, "Light").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.keyboard.press("Escape");
  await expect(button(page, "Appearance")).toBeFocused();
  await openNote(page);
  await trigger.click();
  await page.getByRole("heading", { name: seed[0].title }).click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await page
    .getByRole("navigation", { name: "Notes and collections" })
    .getByRole("button", { name: /Backend/ })
    .click();
  await expect(button(page, seed[1].title)).toBeVisible();
  await expect(button(page, seed[0].title)).toBeHidden();
  await page.getByRole("radio", { name: "Exact" }).check();
  const searchField = page.getByRole("textbox", { name: "Search notes" });
  const searchCount = requests.filter(
    (entry) => entry === "POST /api/notes/search",
  ).length;
  await searchField.fill("Practical");
  expect(
    requests.filter((entry) => entry === "POST /api/notes/search"),
  ).toHaveLength(searchCount);
  await searchField.press("Enter");
  await expect(page.locator(".note-open mark")).toHaveText([
    "Practical",
    "practical",
  ]);
  await openNote(page);
  await button(page, "More note actions").click();
  await button(page, "Delete note").click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete note" })
    .click();
  await expect
    .poll(() => requests.includes("DELETE /api/notes/main"))
    .toBe(true);
  expect(requests.filter((entry) => /favorite|share/.test(entry))).toEqual([]);
});

test("keeps Markdown overflow local and account and import actions usable on mobile", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 390, height: 844 });
  await mockWorkspace(page, "pro");
  await openNote(page);
  await page.getByRole("button", { name: "Copy code" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Copied" }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "const cacheKey",
  );
  const table = page.getByRole("region", { name: "Scrollable Markdown table" });
  expect(
    await table.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    ),
  ).toBe(true);
  await expect(page.getByRole("checkbox", { checked: true })).toBeDisabled();
  await button(page, "Show navigation").click();
  await button(page, "Account menu").click();
  await expect(button(page, "Manage plan")).toBeVisible();
  await button(page, "Manage plan").click();
  await expect(
    page.getByRole("dialog", { name: "Plan & usage" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await button(page, "Import md").click();
  await button(page, "Bulk import").click();
  const bulk = page.getByRole("dialog", { name: "Bulk Markdown import" });
  await expect(bulk).toBeVisible();
  await bulk.locator("input[type=file]").setInputFiles({
    name: "redis.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Redis cache"),
  });
  await bulk.getByRole("button", { name: "Import notes" }).click();
  await expect(bulk.getByText("Saved", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.getByLabel("Import Markdown file", { exact: true }).setInputFiles({
    name: "redis.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Redis cache"),
  });
  await expect(page.locator("#note-content")).toHaveValue("# Redis cache");
});

test("keeps the workspace within the viewport at all seven target widths", async ({
  page,
}) => {
  await mockWorkspace(page);
  await openNote(page);
  for (const width of [1920, 1440, 1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width >= 1024 ? 940 : 844 });
    await expect(
      page.getByRole("heading", { name: seed[0].title }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    if (captureDir && [1440, 1280, 390].includes(width)) {
      for (const theme of ["light", "dark"]) {
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        await page.screenshot({
          path: join(captureDir, `workspace-${width}-${theme}.png`),
          animations: "disabled",
        });
      }
    }
  }
});

test("creates a collection through the anchored popover and preserves input on failure", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockWorkspace(page);
  let attempts = 0;
  const release = Promise.withResolvers<void>();
  await page.route("**/api/collections", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    attempts += 1;
    expect(route.request().postDataJSON()).toEqual({ name: "Shared notes" });
    if (attempts === 1) {
      await release.promise;
      return route.fulfill({
        status: 409,
        json: { message: "Collection already exists." },
      });
    }
    return route.fulfill({
      status: 201,
      json: { collection: { _id: "new", name: "Shared notes" } },
    });
  });
  await button(page, "Show navigation").click();
  const selectedCollection = page.getByRole("button", {
    name: /^System Design(?: \d+)?$/,
  });
  await selectedCollection.click();
  await button(page, "Show navigation").click();
  await expect(selectedCollection).toHaveAttribute("aria-pressed", "true");
  const plus = button(page, "Create collection");
  const name = page.getByLabel("Collection name", { exact: true });
  const form = page.getByRole("form", { name: "New collection" });
  await expect(form).toBeHidden();
  await plus.click();
  await expect(name).toBeFocused();
  await expect(button(page, "Create")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(form).toBeHidden();
  await expect(plus).toBeFocused();
  await plus.click();
  await page.getByText("DevMind", { exact: true }).click();
  await expect(form).toBeHidden();
  await plus.click();
  await name.fill("Shared notes");
  try {
    await name.press("Enter");
    await expect(button(page, "Creating…")).toBeDisabled();
    await expect.poll(() => attempts).toBe(1);
    await name.press("Enter");
    expect(attempts).toBe(1);
  } finally {
    release.resolve();
  }
  await expect(form.getByRole("alert")).toHaveText(
    "Collection already exists.",
  );
  await expect(name).toHaveValue("Shared notes");
  await name.press("Enter");
  await expect(form).toBeHidden();
  await expect(plus).toBeFocused();
  await expect(selectedCollection).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: /Shared notes/ }),
  ).toHaveAttribute("aria-pressed", "false");
  expect(attempts).toBe(2);
});

if (captureDir) {
  for (const width of [1440, 390]) {
    for (const theme of ["light", "dark"]) {
      test(`captures ${width}px ${theme} workspace states`, async ({
        page,
      }) => {
        await page.setViewportSize({
          width,
          height: width === 1440 ? 940 : 844,
        });
        await page.addInitScript(
          (value) => localStorage.setItem("devmind-theme", value),
          theme,
        );
        await mockWorkspace(page);
        const capture = (state: string) =>
          page.screenshot({
            path: join(captureDir, `workspace-${width}-${theme}-${state}.png`),
            animations: "disabled",
          });
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await openNote(page);
        if (width === 390) await button(page, "Show navigation").click();
        await button(page, "Account menu").click();
        await button(page, "Appearance").click();
        await capture("account");
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        await button(page, "Create collection").click();
        await page.getByLabel("Collection name").fill("New collection");
        await capture("collection");
        await button(page, "Cancel").click();
        if (width === 390) await button(page, "Close navigation").click();
        else {
          await button(page, "Collapse navigation").click();
          await capture("collapsed");
          await button(page, "Show navigation").click();
        }
        await button(page, "Edit").click();
        await capture("editor");
        const emptyPage = await page.context().newPage();
        await emptyPage.setViewportSize({
          width,
          height: width === 1440 ? 940 : 844,
        });
        await mockWorkspace(emptyPage);
        // At phone widths browsing is intentionally the first view.
        if (width === 1440) {
          await expect(
            emptyPage.getByRole("heading", { name: "Choose a note" }),
          ).toBeVisible();
          await emptyPage.screenshot({
            path: join(captureDir, `workspace-${width}-${theme}-empty.png`),
            animations: "disabled",
          });
        } else {
          await expect(button(emptyPage, seed[0].title)).toBeVisible();
          await emptyPage.screenshot({
            path: join(captureDir, `workspace-${width}-${theme}-browse.png`),
            animations: "disabled",
          });
        }
        await emptyPage.close();
      });
    }
  }
}
