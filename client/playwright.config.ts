import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test",
  use: { baseURL: "http://127.0.0.1:4173" },
  webServer: {
    command: "pnpm dev --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    env: { VITE_API_URL: "/api" },
  },
});
