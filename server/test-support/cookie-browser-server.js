import { once } from "node:events";
import { mock } from "node:test";
import mongoose from "mongoose";

// Exercise the real HTTP, account, and session paths with isolated MongoDB.
const moduleUrl = (path) => new URL(`../src/${path}`, import.meta.url).href;
mock.module(moduleUrl("config/redis.ts"), {
  exports: { default: { call: async () => null, on: () => {} } },
});
mock.module("rate-limit-redis", {
  exports: {
    default: class RedisStore {
      init() {}
      async increment() {
        return { totalHits: 1, resetTime: new Date(Date.now() + 60_000) };
      }
      async decrement() {}
      async resetKey() {}
    },
  },
});
mock.module(moduleUrl("services/embedding.service.ts"), {
  exports: {
    generateEmbedding: async () => [1, 0],
    generateQueryEmbedding: async () => [1, 0],
    cosineSimilarity: () => 1,
  },
});

const { default: app } = await import("../src/app.ts");
await mongoose.connect(process.env.MONGODB_URI, {
  dbName: process.env.COOKIE_BROWSER_TEST_DATABASE,
  serverSelectionTimeoutMS: 5_000,
});
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");

process.on("disconnect", async () => {
  try {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.dropDatabase();
  } finally {
    await mongoose.disconnect();
  }
});

process.send({ port: server.address().port });
