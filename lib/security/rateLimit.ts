/**
 * Hybrid rate limiter with Upstash Redis support
 *
 * Automatically uses:
 * - Upstash Redis (if UPSTASH_REDIS_URL configured) - Production-ready, serverless-compatible
 * - In-memory fallback (for local development) - Works but doesn't scale
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory fallback for local development
class InMemoryRateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout;
  private readonly MAX_ENTRIES = 10000;

  constructor() {
    this.cleanupInterval = setInterval(
      () => {
        this.cleanup();
      },
      5 * 60 * 1000,
    );

    if (process.env.NODE_ENV === "production") {
      console.warn(
        "⚠️  [RateLimit] Using in-memory rate limiter in production. " +
          "Add UPSTASH_REDIS_URL to enable distributed rate limiting.",
      );
    }
  }

  check(
    identifier: string,
    maxRequests: number,
    windowMs: number,
  ): {
    allowed: boolean;
    remaining: number;
    resetTime: number;
    retryAfter?: number;
  } {
    const now = Date.now();
    const entry = this.limits.get(identifier);

    if (!entry || now > entry.resetTime) {
      const resetTime = now + windowMs;

      if (this.limits.size >= this.MAX_ENTRIES) {
        const oldestKey = this.limits.keys().next().value;
        this.limits.delete(oldestKey);
        console.warn(
          "[RateLimit] Max entries reached, evicted oldest:",
          oldestKey,
        );
      }

      this.limits.set(identifier, {
        count: 1,
        resetTime,
      });
      return {
        allowed: true,
        remaining: maxRequests - 1,
        resetTime,
      };
    }

    entry.count++;

    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.resetTime,
        retryAfter,
      };
    }

    return {
      allowed: true,
      remaining: maxRequests - entry.count,
      resetTime: entry.resetTime,
    };
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.limits.entries()) {
      if (now > entry.resetTime) {
        this.limits.delete(key);
      }
    }
  }

  clear() {
    this.limits.clear();
  }

  destroy() {
    clearInterval(this.cleanupInterval);
    this.limits.clear();
  }
}

// Rate limit configurations
export const RATE_LIMITS = {
  CHATKIT_PER_IP: {
    maxRequests: 20,
    windowMs: 60 * 1000, // 1 minute
  },
  CHATKIT_PER_SESSION: {
    maxRequests: 50,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
  REALTIME_CONFIG: {
    maxRequests: 10,
    windowMs: 60 * 1000,
  },
  TELEMETRY: {
    maxRequests: 100,
    windowMs: 60 * 1000,
  },
} as const;

// Initialize Upstash Redis if configured
let upstashRedis: Redis | null = null;
let upstashRateLimiters: Map<string, Ratelimit> = new Map();

try {
  if (process.env.UPSTASH_REDIS_URL && process.env.UPSTASH_REDIS_TOKEN) {
    upstashRedis = new Redis({
      url: process.env.UPSTASH_REDIS_URL,
      token: process.env.UPSTASH_REDIS_TOKEN,
    });
    console.log(
      "✅ [RateLimit] Upstash Redis configured - using distributed rate limiting",
    );
  } else {
    console.log(
      "ℹ️  [RateLimit] Upstash not configured - using in-memory fallback. " +
        "Set UPSTASH_REDIS_URL and UPSTASH_REDIS_TOKEN for production.",
    );
  }
} catch (error) {
  console.error("❌ [RateLimit] Failed to initialize Upstash:", error);
  upstashRedis = null;
}

// Fallback limiter
const inMemoryLimiter = new InMemoryRateLimiter();

/**
 * Get or create Upstash rate limiter for a specific config
 */
function getUpstashLimiter(
  prefix: string,
  maxRequests: number,
  windowMs: number,
): Ratelimit | null {
  if (!upstashRedis) return null;

  const key = `${prefix}:${maxRequests}:${windowMs}`;
  if (upstashRateLimiters.has(key)) {
    return upstashRateLimiters.get(key)!;
  }

  const limiter = new Ratelimit({
    redis: upstashRedis,
    limiter: Ratelimit.slidingWindow(maxRequests, `${windowMs} ms`),
    prefix,
    analytics: true, // Enable analytics for monitoring
  });

  upstashRateLimiters.set(key, limiter);
  return limiter;
}

/**
 * Check rate limit using Upstash (if configured) or in-memory fallback
 */
export async function checkRateLimit(
  identifier: string,
  config: { maxRequests: number; windowMs: number },
  prefix: string = "ratelimit",
): Promise<{
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}> {
  // Try Upstash first
  const upstashLimiter = getUpstashLimiter(
    prefix,
    config.maxRequests,
    config.windowMs,
  );

  if (upstashLimiter) {
    try {
      const result = await upstashLimiter.limit(identifier);

      return {
        allowed: result.success,
        remaining: result.remaining,
        resetTime: result.reset,
        retryAfter: result.success
          ? undefined
          : Math.ceil((result.reset - Date.now()) / 1000),
      };
    } catch (error) {
      console.error(
        "[RateLimit] Upstash error, falling back to in-memory:",
        error,
      );
      // Fall through to in-memory
    }
  }

  // Fallback to in-memory
  return inMemoryLimiter.check(identifier, config.maxRequests, config.windowMs);
}

/**
 * Get client identifier (IP address with fallback)
 */
export function getClientIdentifier(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cfConnectingIp = request.headers.get("cf-connecting-ip");

  // @ts-ignore - ip exists on NextRequest
  const ip =
    cfConnectingIp ||
    realIp ||
    forwarded?.split(",")[0] ||
    request.ip ||
    "127.0.0.1";

  return ip.trim();
}

/**
 * Apply rate limit and return response if blocked
 */
export async function applyRateLimit(
  identifier: string,
  config: { maxRequests: number; windowMs: number },
  endpoint: string,
): Promise<{ allowed: boolean; response?: Response; headers: HeadersInit }> {
  // Skip rate limiting for localhost in development
  if (
    process.env.NODE_ENV === "development" &&
    (identifier === "127.0.0.1" ||
      identifier === "::1" ||
      identifier === "::ffff:127.0.0.1")
  ) {
    return {
      allowed: true,
      headers: {
        "X-RateLimit-Limit": config.maxRequests.toString(),
        "X-RateLimit-Remaining": config.maxRequests.toString(),
        "X-RateLimit-Reset": new Date(
          Date.now() + config.windowMs,
        ).toISOString(),
      },
    };
  }

  const result = await checkRateLimit(identifier, config, endpoint);

  const headers: HeadersInit = {
    "X-RateLimit-Limit": config.maxRequests.toString(),
    "X-RateLimit-Remaining": result.remaining.toString(),
    "X-RateLimit-Reset": new Date(result.resetTime).toISOString(),
  };

  if (!result.allowed) {
    console.warn(
      `[RateLimit] Blocked ${identifier} on ${endpoint} - ${result.retryAfter}s retry`,
    );

    return {
      allowed: false,
      response: Response.json(
        {
          error: "Too many requests",
          message: `Rate limit exceeded. Please try again in ${result.retryAfter} seconds.`,
          retryAfter: result.retryAfter,
        },
        {
          status: 429,
          headers: {
            ...headers,
            "Retry-After": result.retryAfter?.toString() || "60",
          },
        },
      ),
      headers,
    };
  }

  return { allowed: true, headers };
}

// Legacy export for backward compatibility
export const rateLimiter = inMemoryLimiter;
