import { env } from "./config/env.js";
import app from "./app.js";
import mongoose from "mongoose";
import redis from "./config/redis.js";

let httpServer;
let shuttingDown = false;

const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`${signal} received. Shutting down...`);
  const forceExit = setTimeout(() => {
    console.error("Forced shutdown after 10 seconds");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  try {
    if (httpServer) {
      await new Promise((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await mongoose.connection.close();
    await redis.quit();
    clearTimeout(forceExit);
    process.exit(0);
  } catch (error) {
    clearTimeout(forceExit);
    console.error("Shutdown error:", error);
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

console.log("Starting DevMind server...");
console.log("PORT:", env.PORT);

mongoose
  .connect(env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected");
    httpServer = app.listen(env.PORT, "0.0.0.0", () => {
      console.log(`Backend chạy tại http://localhost:${env.PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  });
