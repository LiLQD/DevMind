import { expect, test } from "@playwright/test";
import type { Request } from "@playwright/test";

const accountA = {
  token: "account-a",
  note: {
    _id: "note-a",
    title: "Account A private note",
    content: "Account A private content",
    createdAt: "2026-01-01",
  },
  collection: { _id: "collection-a", name: "Account A private collection" },
};

const accountB = {
  token: "account-b",
  note: {
    _id: "note-b",
    title: "Account B note",
    content: "Account B content",
    createdAt: "2026-01-01",
  },
  collection: { _id: "collection-b", name: "Account B collection" },
};

for (const outcome of ["abort", "late success", "late error"]) {
  const ignoresAbort = outcome !== "abort";
  test(`isolates workspace on account change with ${outcome}`, async ({
    page,
  }) => {
    await page.addInitScript(
      ({ token, ignoresAbort }) => {
        localStorage.setItem("token", token);
        if (!ignoresAbort) return;

        // Simulate a transport that still delivers account A's response after abort.
        const fetch = window.fetch.bind(window);
        window.fetch = (input, options) =>
          new Headers(options?.headers).get("Authorization") ===
          `Bearer ${token}`
            ? fetch(input, { ...options, signal: undefined })
            : fetch(input, options);
      },
      { token: accountA.token, ignoresAbort },
    );

    const releaseA = Promise.withResolvers<void>();
    const releaseBSearch = Promise.withResolvers<void>();
    let holdCollectionsA = false;
    const notesFiltersB: (string | null)[] = [];
    const heldA = new Map<string, Request>();
    const pathsA = ["/api/notes", "/api/collections", "/api/notes/search"];

    async function holdAccountA(path: string, request: Request) {
      if (!heldA.has(path)) heldA.set(path, request);
      await releaseA.promise;
    }

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const { pathname } = url;
      const isAccountA =
        request.headers().authorization === `Bearer ${accountA.token}`;

      if (pathname === "/api/auth/login") {
        await route.fulfill({
          json: { token: accountB.token, user: { name: "Account B" } },
        });
        return;
      }
      if (pathname === "/api/subscription") {
        await route.fulfill({
          json: { entitlements: { bulkMarkdownImport: false } },
        });
        return;
      }
      if (pathname === "/api/collections") {
        if (isAccountA && holdCollectionsA) {
          await holdAccountA(pathname, request);
          if (!ignoresAbort) return;
        }
        await route.fulfill({
          json: [isAccountA ? accountA.collection : accountB.collection],
        });
        return;
      }
      if (pathname === "/api/notes") {
        if (isAccountA && url.searchParams.has("collectionId")) {
          await holdAccountA(pathname, request);
          if (!ignoresAbort) return;
        }
        if (!isAccountA)
          notesFiltersB.push(url.searchParams.get("collectionId"));
        await route.fulfill({
          json: [isAccountA ? accountA.note : accountB.note],
        });
        return;
      }
      if (pathname === "/api/notes/search") {
        if (isAccountA) {
          await holdAccountA(pathname, request);
          if (!ignoresAbort) return;
          if (outcome === "late error") {
            await route.fulfill({
              status: 503,
              json: { message: "Account A late search error" },
            });
          } else {
            await route.fulfill({ json: { results: [accountA.note] } });
          }
        } else {
          await releaseBSearch.promise;
          await route.fulfill({ json: { results: [accountB.note] } });
        }
        return;
      }
      await route.abort();
    });

    try {
      await page.goto("/");
      const filter = page.getByRole("combobox", {
        name: "Filter notes by collection",
      });
      const mode = page.getByRole("combobox", { name: "Search mode" });
      const query = page.getByRole("textbox", { name: "Search notes" });
      await expect(
        page.getByRole("button", { name: accountA.note.title }),
      ).toBeVisible();
      await expect(filter).toBeVisible();
      holdCollectionsA = true;
      await filter.selectOption(accountA.collection._id);
      await mode.selectOption("exact");
      await query.fill("account A query");
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await expect.poll(() => heldA.size).toBe(pathsA.length);
      const settledA = Promise.all(
        pathsA.map((path) =>
          page.waitForEvent(
            ignoresAbort ? "requestfinished" : "requestfailed",
            (request) => request === heldA.get(path),
          ),
        ),
      );

      await page.getByRole("button", { name: "Logout" }).click();
      await page.getByLabel("Email").fill("b@example.com");
      await page.getByLabel("Password").fill("test-password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();

      await expect(
        page.getByRole("button", { name: accountB.note.title }),
      ).toBeVisible();
      expect(notesFiltersB).toEqual([null]);
      await expect(filter).toHaveValue("");
      await expect(mode).toHaveValue("semantic");
      await expect(query).toBeEmpty();
      await query.fill("account B query");
      await page.getByRole("button", { name: "Search", exact: true }).click();
      const searching = page.getByRole("button", { name: "Searching…" });
      await expect(searching).toBeDisabled();

      if (ignoresAbort) releaseA.resolve();
      const errors = (await settledA).map(
        (request) => request.failure()?.errorText,
      );
      expect(errors).toEqual(
        pathsA.map(() => (ignoresAbort ? undefined : "net::ERR_ABORTED")),
      );
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
      );

      await expect(searching).toBeDisabled();
      await expect(
        page.getByRole("button", { name: accountB.note.title }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: accountA.note.title }),
      ).toHaveCount(0);
      await expect(
        filter.getByRole("option", { name: accountA.collection.name }),
      ).toHaveCount(0);
      await expect(page.getByText("Account A late search error")).toHaveCount(
        0,
      );

      releaseBSearch.resolve();
      await expect(
        page.getByRole("button", { name: "Search", exact: true }),
      ).toBeEnabled();
      await expect(page.getByText("1 match", { exact: true })).toBeVisible();
    } finally {
      releaseA.resolve();
      releaseBSearch.resolve();
    }
  });
}
