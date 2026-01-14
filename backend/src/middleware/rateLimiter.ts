/**
 * Rate Limiter Middleware - FAZ 5
 * Redis-backed rate limiting for production multi-instance deployments
 * 
 * Strategies:
 * - Logged-in users: userId
 * - Anonymous: IP address
 * 
 * ENV:
 * - REDIS_URL (optional, falls back to in-memory if missing)
 * - RATE_LIMIT_ENABLED=true/false
 */

import { Response, NextFunction } from "express";
import { RateLimiterRedis, RateLimiterMemory } from "rate-limiter-flexible";
import Redis from "ioredis";
import { AuthRequest } from "./auth";

const RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED === "true";
const REDIS_URL = process.env.REDIS_URL;
const NODE_ENV = process.env.NODE_ENV || "development";

// Redis client (optional in dev, required in prod)
let redisClient: Redis | null = null;
if (REDIS_URL && RATE_LIMIT_ENABLED) {
  redisClient = new Redis(REDIS_URL, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });

  redisClient.on("error", (err) => {
    console.error("⚠️  Redis rate limiter connection error:", err.message);
    if (NODE_ENV === "production") {
      console.error("🔴 FATAL: Redis required for production rate limiting");
      process.exit(1);
    }
  });

  redisClient.on("connect", () => {
    console.log("✅ Redis rate limiter connected");
  });
} else if (RATE_LIMIT_ENABLED && NODE_ENV === "production") {
  console.error("🔴 FATAL: REDIS_URL required when RATE_LIMIT_ENABLED=true in production");
  process.exit(1);
} else if (RATE_LIMIT_ENABLED) {
  console.warn("⚠️  WARNING: Rate limiting enabled without Redis (in-memory fallback - NOT production safe)");
}

/**
 * Rate limiter configurations
 * duration: seconds
 * points: allowed requests
 */
const rateLimiterConfigs = {
  // Auth endpoints: 10 requests per 10 minutes per IP
  auth: {
    points: 10,
    duration: 600, // 10 minutes
  },
  // Presign upload: 30 requests per 10 minutes per user
  presignUpload: {
    points: 30,
    duration: 600,
  },
  // Presign download: 60 requests per 10 minutes per user
  presignDownload: {
    points: 60,
    duration: 600,
  },
  // Migration endpoints: 10 requests per 10 minutes per user
  migration: {
    points: 10,
    duration: 600,
  },
  // Admin endpoints: 20 requests per 10 minutes per user
  admin: {
    points: 20,
    duration: 600,
  },
  // Generic API: 100 requests per 10 minutes per user/IP
  generic: {
    points: 100,
    duration: 600,
  },
};

/**
 * Create rate limiter instance (Redis or in-memory fallback)
 */
function createRateLimiter(config: { points: number; duration: number }) {
  if (redisClient && RATE_LIMIT_ENABLED) {
    return new RateLimiterRedis({
      storeClient: redisClient,
      ...config,
      blockDuration: 0, // Don't block, just reject
    });
  }
  // Fallback to in-memory (NOT recommended for production with multiple instances)
  return new RateLimiterMemory({
    ...config,
    blockDuration: 0,
  });
}

// Limiter instances
const limiters = {
  auth: createRateLimiter(rateLimiterConfigs.auth),
  presignUpload: createRateLimiter(rateLimiterConfigs.presignUpload),
  presignDownload: createRateLimiter(rateLimiterConfigs.presignDownload),
  migration: createRateLimiter(rateLimiterConfigs.migration),
  admin: createRateLimiter(rateLimiterConfigs.admin),
  generic: createRateLimiter(rateLimiterConfigs.generic),
};

// Track warning state
let rateLimitWarningShown = false;

/**
 * Rate limit middleware factory
 */
export function rateLimitMiddleware(
  limiterType: keyof typeof limiters
) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!RATE_LIMIT_ENABLED) {
      // Log only once on first request
      if (!rateLimitWarningShown) {
        console.warn("⚠️  Rate limiting is DISABLED (set RATE_LIMIT_ENABLED=true)");
        rateLimitWarningShown = true;
      }
      return next();
    }

    const limiter = limiters[limiterType];

    // Key strategy: userId if logged in, else IP
    const key = req.userId || req.ip || "unknown";

    try {
      await limiter.consume(key);
      next();
    } catch (rejRes: any) {
      // Rate limit exceeded
      const retryAfter = Math.ceil(rejRes.msBeforeNext / 1000) || 600;

      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({
        message: "Too many requests. Please try again later.",
      });
    }
  };
}

/**
 * Specific middleware exports for common use cases
 */
export const rateLimitAuth = rateLimitMiddleware("auth");
export const rateLimitPresignUpload = rateLimitMiddleware("presignUpload");
export const rateLimitPresignDownload = rateLimitMiddleware("presignDownload");
export const rateLimitMigration = rateLimitMiddleware("migration");
export const rateLimitAdmin = rateLimitMiddleware("admin");
export const rateLimitGeneric = rateLimitMiddleware("generic");
