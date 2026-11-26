import express from "express";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import mongoose from "mongoose";
import { env } from "./config/env.ts";
import { requireCookieOrigin } from "./middleware/cookie-auth.middleware.ts";

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

  app.use((req, res, next) => {
    const startedAt = performance.now();
    const { method, path } = req;

    res.once("finish", () => {
      console.log(
        JSON.stringify({
          method,
          path,
          status: res.statusCode,
          durationMs: Math.round(performance.now() - startedAt),
        }),
      );
    });
    next();
  });

  // Middleware
  app.use(helmet());
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  if (!env.MOCK_BILLING_ENABLED) app.use("/api/mock-billing", notFound);
  app.use("/api", requireCookieOrigin);
  app.use(express.json({ limit: "1mb" }));

  // Liveness probes must succeed independently of Redis and the API quota.
  app.get("/api/health", (req, res) => {
    res.json({
      status: "OK",
      message: "DevMind API running",
      timestamp: new Date().toISOString(),
    });
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
        type?: unknown;
      },
      _req: Request,
      res: Response,
      next: NextFunction,
    ) => {
      if (res.headersSent) return next(err);
      const status = isInteger(err.statusCode)
        ? err.statusCode
        : isInteger(err.status)
          ? err.status
          : 500;
      const isServerError = status >= 500;

      if (
        err.type === "entity.parse.failed" ||
        err.type === "entity.too.large"
      ) {
        const tooLarge = err.type === "entity.too.large";
        return res.status(tooLarge ? 413 : 400).json({
          success: false,
          error: {
            code: tooLarge ? "REQUEST_TOO_LARGE" : "INVALID_JSON",
            message: tooLarge
              ? "Request body is too large."
              : "Invalid JSON request body.",
          },
        });
      }
      if (isServerError) console.error("Cookie-mode API request failed.");

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

function notFound(_req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "Endpoint not found.",
    },
  });
}

function isInteger(value: unknown): value is number {
  return Number.isInteger(value);
}
