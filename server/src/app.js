import express from "express";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";
import { env } from "./config/env.ts";

import authRoutes from "./routes/auth.routes.js";
import noteRoutes from "./routes/notes.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import staffRoutes from "./routes/staff.routes.js";
import tagRoutes from "./routes/tag.routes.js";
import collectionRoutes from "./routes/collection.routes.js";

import { generalLimiter, searchLimiter } from "./middleware/rateLimiter.js";
import redis from "./config/redis.ts";

console.log("Configuring Express app...");

export function createApp() {
  const app = express();
  app.set("trust proxy", env.TRUST_PROXY);

  // Middleware
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        callback(null, !origin || env.CORS_ORIGINS.includes(origin));
      },
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  // Logging
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });

  // Rate limiting
  app.use("/api", generalLimiter);
  app.use("/api/notes/search", searchLimiter);
  app.use("/api/notes/:id/related", searchLimiter);

  // Root route
  app.get("/", (req, res) => {
    res.json({
      message: "DevMind API v1.0",
      status: "running",
      endpoints: {
        health: "/api/health",
        auth: "/api/auth/register",
        login: "/api/auth/login",
        notes: "/api/notes",
      },
    });
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({
      status: "OK",
      message: "DevMind API running",
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/ready", async (req, res) => {
    const databaseReady = mongoose.connection.readyState === 1;
    let redisReady = false;

    try {
      await redis.ping();
      redisReady = true;
    } catch (error) {
      console.error("Redis readiness check failed:", error);
    }

    const ready = databaseReady && redisReady;
    res.status(ready ? 200 : 503).json({
      status: ready ? "READY" : "NOT_READY",
      checks: {
        database: databaseReady,
        redis: redisReady,
      },
    });
  });

  // API Routes
  console.log("Mounting routes...");
  app.use("/api/auth", authRoutes);
  app.use("/api/notes", noteRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/staff", staffRoutes);
  app.use("/api/tags", tagRoutes);
  app.use("/api/collections", collectionRoutes);

  console.log("Routes mounted");

  // 404 handler
  app.use((req, res) => {
    console.log(`404: ${req.method} ${req.url}`);
    res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: `Không tìm thấy endpoint ${req.method} ${req.url}`,
      },
    });
  });

  // Error handler
  app.use((err, req, res, _next) => {
    console.error("Error:", err);
    const status = Number.isInteger(err.statusCode)
      ? err.statusCode
      : Number.isInteger(err.status)
        ? err.status
        : 500;
    const isServerError = status >= 500;

    res.status(status).json({
      success: false,
      error: {
        code: isServerError ? "INTERNAL_ERROR" : err.code || "REQUEST_ERROR",
        message: isServerError
          ? "Internal server error"
          : err.message || "Request failed",
      },
    });
  });

  console.log("App configured");

  return app;
}

export default createApp();
