import express from "express";
import type { NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";
import { env } from "./config/env.ts";

import authRoutes from "./routes/auth.routes.ts";
import noteRoutes from "./routes/notes.routes.ts";
import adminRoutes from "./routes/admin.routes.ts";
import staffRoutes from "./routes/staff.routes.ts";
import tagRoutes from "./routes/tag.routes.ts";
import collectionRoutes from "./routes/collection.routes.ts";
import subscriptionRoutes from "./routes/subscription.routes.ts";
import mockBillingRoutes from "./routes/mockBilling.routes.ts";

import { generalLimiter, searchLimiter } from "./middleware/rateLimiter.ts";
import redis from "./config/redis.ts";

console.log("Configuring Express app...");

export function createApp() {
  const app = express();
  app.set("trust proxy", env.TRUST_PROXY);

  // Middleware
  app.use(helmet());
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  if (!env.MOCK_BILLING_ENABLED) app.use("/api/mock-billing", notFound);
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
  app.use("/api/subscription", subscriptionRoutes);
  if (env.MOCK_BILLING_ENABLED) {
    app.use("/api/mock-billing", mockBillingRoutes);
  }

  console.log("Routes mounted");

  // 404 handler
  app.use(notFound);

  // Error handler
  app.use(
    (
      err: {
        statusCode?: unknown;
        status?: unknown;
        code?: unknown;
        message?: unknown;
      },
      _req: Request,
      res: Response,
      _next: NextFunction,
    ) => {
      console.error("Error:", err);
      const status = isInteger(err.statusCode)
        ? err.statusCode
        : isInteger(err.status)
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
    },
  );

  console.log("App configured");

  return app;
}

export default createApp();

function notFound(req: Request, res: Response) {
  console.log(`404: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: `Không tìm thấy endpoint ${req.method} ${req.originalUrl}`,
    },
  });
}

function isInteger(value: unknown): value is number {
  return Number.isInteger(value);
}
