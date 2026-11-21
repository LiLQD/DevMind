import { rateLimit } from "express-rate-limit";
// rate-limit-redis only has a default export at runtime; named import crashes Node ESM
// oxlint-disable-next-line import/no-named-as-default
import RedisStore from "rate-limit-redis";
import type { RedisReply } from "rate-limit-redis";
import redis from "../config/redis.ts";

// The store validates SCRIPT and EVALSHA replies. ioredis types raw replies as unknown.
const sendCommand = (command: string, ...args: string[]) =>
  redis.call(command, ...args) as Promise<RedisReply>;

// General limiter: 200 requests per 15 min per IP
export const generalLimiter = rateLimit({
  store: new RedisStore({
    sendCommand,
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { error: "Too many requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const searchLimiter = rateLimit({
  store: new RedisStore({
    sendCommand,
  }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50,
  message: { error: "Search limit exceeded. Try again in an hour." },
  standardHeaders: true,
  legacyHeaders: false,
});
