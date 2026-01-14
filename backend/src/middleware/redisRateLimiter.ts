// backend/src/middleware/redisRateLimiter.ts
import { Request, Response, NextFunction } from "express";
import Redis from "ioredis";

// Redis client instance (singleton)
let redisClient: Redis | null = null;

/**
 * Initialize Redis client for rate limiting
 */
function getRedisClient(): Redis | null {
  const REDIS_URL = process.env.REDIS_URL;
  const RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED === "true";

  if (!RATE_LIMIT_ENABLED || !REDIS_URL) {
    return null;
  }

  if (!redisClient) {
    try {
      redisClient = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        retryStrategy: (times) => {
          if (times > 3) {
            console.error("🔴 Redis connection failed after 3 retries");
            return null;
          }
          return Math.min(times * 100, 2000); // Exponential backoff
        },
      });

      redisClient.on("connect", () => {
        console.log("✅ Redis connected for rate limiting");
      });

      redisClient.on("error", (err) => {
        console.error("🔴 Redis error:", err.message);
      });
    } catch (error) {
      console.error("Failed to initialize Redis:", error);
      return null;
    }
  }

  return redisClient;
}

/**
 * Redis-based Rate Limiter
 * Uses sliding window algorithm for accurate rate limiting across multiple instances
 */
export const redisRateLimiter = (options: {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}) => {
  const { windowMs, maxRequests, keyPrefix } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    const redis = getRedisClient();

    // Fallback to in-memory rate limiter if Redis unavailable
    if (!redis) {
      console.warn("⚠️  Redis unavailable, using in-memory rate limiter");
      return inMemoryRateLimiter(options)(req, res, next);
    }

    const userId = (req as any).userId || req.ip || "anonymous";
    const key = `${keyPrefix}:${userId}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    try {
      // Use Redis sorted set for sliding window
      const pipeline = redis.pipeline();
      
      // Remove old entries outside the window
      pipeline.zremrangebyscore(key, 0, windowStart);
      
      // Count current requests in window
      pipeline.zcard(key);
      
      // Add current request
      pipeline.zadd(key, now, `${now}-${Math.random()}`);
      
      // Set expiration
      pipeline.expire(key, Math.ceil(windowMs / 1000));

      const results = await pipeline.exec();
      const currentCount = (results?.[1]?.[1] as number) || 0;

      // Check if limit exceeded
      if (currentCount >= maxRequests) {
        const retryAfter = Math.ceil(windowMs / 1000);
        
        res.setHeader("X-RateLimit-Limit", maxRequests.toString());
        res.setHeader("X-RateLimit-Remaining", "0");
        res.setHeader("X-RateLimit-Reset", new Date(now + windowMs).toISOString());
        res.setHeader("Retry-After", retryAfter.toString());

        console.warn(`⚠️  Rate limit exceeded for ${userId} on ${keyPrefix}`);

        return res.status(429).json({
          error: "Too many requests, please try again later",
          retryAfter,
        });
      }

      // Set rate limit headers
      res.setHeader("X-RateLimit-Limit", maxRequests.toString());
      res.setHeader("X-RateLimit-Remaining", (maxRequests - currentCount - 1).toString());
      res.setHeader("X-RateLimit-Reset", new Date(now + windowMs).toISOString());

      next();
    } catch (error) {
      console.error("Redis rate limiter error:", error);
      // Fail open: allow request if Redis fails
      next();
    }
  };
};

/**
 * In-Memory Rate Limiter (Fallback)
 * For single-instance deployments or when Redis is unavailable
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function inMemoryRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}) {
  const { windowMs, maxRequests, keyPrefix } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).userId || req.ip || "anonymous";
    const key = `${keyPrefix}:${userId}`;
    const now = Date.now();

    let record = rateLimitMap.get(key);

    // Reset if window expired
    if (!record || now > record.resetAt) {
      record = { count: 0, resetAt: now + windowMs };
    }

    record.count++;

    if (record.count > maxRequests) {
      const retryAfter = Math.ceil((record.resetAt - now) / 1000);

      res.setHeader("X-RateLimit-Limit", maxRequests.toString());
      res.setHeader("X-RateLimit-Remaining", "0");
      res.setHeader("Retry-After", retryAfter.toString());

      console.warn(`⚠️  [IN-MEMORY] Rate limit exceeded for ${userId} on ${keyPrefix}`);

      return res.status(429).json({
        error: "Too many requests, please try again later",
        retryAfter,
      });
    }

    rateLimitMap.set(key, record);

    res.setHeader("X-RateLimit-Limit", maxRequests.toString());
    res.setHeader("X-RateLimit-Remaining", (maxRequests - record.count).toString());

    next();
  };
}

// Cleanup old entries periodically (for in-memory limiter)
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, 60000); // Clean every minute

// Export Redis client for health checks
export const getRedisHealth = async (): Promise<{ connected: boolean; latency?: number }> => {
  const redis = getRedisClient();
  
  if (!redis) {
    return { connected: false };
  }

  try {
    const start = Date.now();
    await redis.ping();
    const latency = Date.now() - start;
    return { connected: true, latency };
  } catch (error) {
    return { connected: false };
  }
};
