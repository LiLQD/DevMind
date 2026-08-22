import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import redis from '../config/redis.js';

// General limiter: 200 requests per 15 min per IP
export const generalLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args) => redis.call(...args),
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimit.ipKeyGenerator,
});

export const searchLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args) => redis.call(...args),
  }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50,
  message: { error: 'Search limit exceeded. Try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimit.ipKeyGenerator,
});
