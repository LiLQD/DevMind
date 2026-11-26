import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer as createUpstream } from "node:http";
import { expect, test } from "@playwright/test";
import { createServer } from "vite";
import type { AddressInfo } from "node:net";

const content = `# Migration fixture\n\nRésumé\n${"x".repeat(1024 * 1024 - 512)}`;
const posted: { key: string; title: string; content: string }[] = [];
let frontend: Awaited<ReturnType<typeof createServer>>;
let upstream: ReturnType<typeof createUpstream>;
let origin: string;

test.beforeAll(async () => {
  upstream = createUpstream(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("RateLimit-Limit", "200");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/api/unavailable") {
      request.socket.destroy();
      return;
    }
    if (request.headers.cookie !== "devmind-access=test-cookie") {
      response.writeHead(401).end(JSON.stringify({ message: "Unauthorized" }));
      return;
    }

    switch (request.url) {
      case "/api/auth/session":
        response.end(
          JSON.stringify({
            sessionId: "proxy-session",
            user: { id: "proxy-account", name: "Proxy account" },
          }),
        );
        break;
      case "/api/auth/csrf":
        response.end(
          JSON.stringify({ csrfToken: "proxy-session.9999999999.proof" }),
        );
        break;
      case "/api/notes?collectionId=example":
        response.end(
          JSON.stringify({
            method: request.method,
            path: request.url,
            forwardedHeaders: Object.keys(request.headers).filter(
              (header) =>
                header.includes("forwarded") || header === "x-real-ip",
            ),
          }),
        );
        break;
      case "/api/notes/import": {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const { notes } = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        posted.push(...notes);
        response.end(
          JSON.stringify({
            results: notes.map(({ key }: { key: string }, index: number) => ({
              key,
              index,
              status: "saved",
              embeddingStatus: "success",
            })),
          }),
        );
        break;
      }
      case "/api/notes":
        response.end(
          JSON.stringify(
            posted.map((note) => ({
              ...note,
              _id: note.key,
              createdAt: "2026-01-01",
              embeddingStatus: "success",
            })),
          ),
        );
        break;
      case "/api/subscription":
        response.end(
          JSON.stringify({ entitlements: { bulkMarkdownImport: true } }),
        );
        break;
      default:
        response.end("[]");
    }
  }).listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const apiPort = (upstream.address() as AddressInfo).port;
  const previousOrigin = process.env.DEVMIND_DEV_API_ORIGIN;
  process.env.DEVMIND_DEV_API_ORIGIN = `http://127.0.0.1:${apiPort}`;
  try {
    frontend = await createServer({
      server: { host: "127.0.0.1", port: 0 },
    });
  } finally {
    if (previousOrigin === undefined) delete process.env.DEVMIND_DEV_API_ORIGIN;
    else process.env.DEVMIND_DEV_API_ORIGIN = previousOrigin;
  }
  await frontend.listen();
  origin = frontend.resolvedUrls!.local[0];
});

test.afterAll(async () => {
  await frontend?.close();
  if (upstream) {
    await new Promise<void>((resolve, reject) => {
      upstream.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("forwards API paths, cookie headers, no-store, and upstream status", async ({
  request,
}) => {
  const url = new URL("/api/notes?collectionId=example", origin).href;
  const guest = await request.get(url);
  expect(guest.status()).toBe(401);
  expect(guest.headers()["cache-control"]).toBe("no-store");

  const response = await request.get(url, {
    headers: {
      Cookie: "devmind-access=test-cookie",
      Forwarded: "for=192.0.2.2",
      "X-Forwarded-For": "192.0.2.2",
      "X-Real-IP": "192.0.2.2",
      "X-Vercel-Forwarded-For": "192.0.2.2",
    },
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    method: "GET",
    path: "/api/notes?collectionId=example",
    forwardedHeaders: [],
  });
  expect(response.headers()).toMatchObject({
    "cache-control": "no-store",
    "ratelimit-limit": "200",
    "x-content-type-options": "nosniff",
  });
});

test("a broken upstream returns an API failure instead of the SPA", async ({
  request,
}) => {
  const response = await request.get(new URL("/api/unavailable", origin).href);
  expect(response.status()).toBeGreaterThanOrEqual(500);
  expect(response.headers()["content-type"] ?? "").not.toContain("text/html");
});

test("bulk imports Markdown through the proxy and downloads the full export", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "devmind-access", value: "test-cookie", url: origin },
  ]);
  await page.goto(origin);
  await page.getByRole("button", { name: "Import md", exact: true }).click();
  await page.getByRole("button", { name: "Bulk import" }).click();
  const dialog = page.getByRole("dialog", { name: "Bulk Markdown import" });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "Proxy fixture.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(content),
  });
  await dialog.getByRole("button", { name: "Import notes" }).click();
  await expect(dialog.getByRole("status")).toContainText("1 notes saved.");
  expect(posted).toEqual([
    { key: expect.any(String), title: "Proxy fixture", content },
  ]);
  await dialog.getByRole("button", { name: "Close" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Export all notes" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("devmind-notes.md");
  expect(await readFile(await file.path(), "utf8")).toBe(
    `# Proxy fixture\n\n${content}\n`,
  );
});
