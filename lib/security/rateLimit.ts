/**
 * Simple in-memory rate limiter for ChatKit endpoints
 *
 * For production with multiple servers, upgrade to:
 * - Upstash Redis (@upstash/ratelimit)
 * - Vercel KV
 * - Redis
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Check if request is allowed
   * @param identifier - IP address or session ID
   * @param maxRequests - Maximum requests allowed
   * @param windowMs - Time window in milliseconds
   * @returns { allowed: boolean, remaining: number, resetTime: number }
   */
  check(identifier: string, maxRequests: number, windowMs: number): {
    allowed: boolean;
    remaining: number;
    resetTime: number;
    retryAfter?: number;
  } {
    const now = Date.now();
    const entry = this.limits.get(identifier);

    // No existing entry or expired
    if (!entry || now > entry.resetTime) {
      const resetTime = now + windowMs;
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

    // Increment count
    entry.count++;

    // Check if over limit
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

  /**
   * Remove expired entries to prevent memory leaks
   */
  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.limits.entries()) {
      if (now > entry.resetTime) {
        this.limits.delete(key);
      }
    }
  }

  /**
   * Get current stats (for monitoring)
   */
  getStats() {
    return {
      totalEntries: this.limits.size,
      activeEntries: Array.from(this.limits.values()).filter(
        (e) => Date.now() <= e.resetTime
      ).length,
    };
  }

  /**
   * Clear all entries (useful for testing)
   */
  clear() {
    this.limits.clear();
  }

  /**
   * Cleanup on shutdown
   */
  destroy() {
    clearInterval(this.cleanupInterval);
    this.limits.clear();
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();

// Rate limit configurations
export const RATE_LIMITS = {
  // ChatKit endpoints - per IP
  CHATKIT_PER_IP: {
    maxRequests: 20, // 20 requests
    windowMs: 60 * 1000, // per minute
  },

  // ChatKit endpoints - per session
  CHATKIT_PER_SESSION: {
    maxRequests: 50, // 50 requests
    windowMs: 60 * 60 * 1000, // per hour
  },

  // Realtime config endpoint - per IP
  REALTIME_CONFIG: {
    maxRequests: 10,
    windowMs: 60 * 1000,
  },

  // Telemetry endpoint - per IP
  TELEMETRY: {
    maxRequests: 100,
    windowMs: 60 * 1000,
  },
} as const;

/**
 * Get client identifier (IP address with fallback)
 */
export function getClientIdentifier(request: Request): string {
  // Try various headers for IP (Vercel, Cloudflare, etc.)
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');

  // @ts-ignore - ip exists on NextRequest
  const ip = cfConnectingIp || realIp || forwarded?.split(',')[0] || request.ip || '127.0.0.1';

  return ip.trim();
}

/**
 * Helper to apply rate limit and return response if blocked
 */
export function applyRateLimit(
  identifier: string,
  config: { maxRequests: number; windowMs: number },
  endpoint: string
): { allowed: boolean; response?: Response; headers: HeadersInit } {
  const result = rateLimiter.check(identifier, config.maxRequests, config.windowMs);

  const headers: HeadersInit = {
    'X-RateLimit-Limit': config.maxRequests.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': new Date(result.resetTime).toISOString(),
  };

  if (!result.allowed) {
    console.warn(`[RateLimit] Blocked ${identifier} on ${endpoint} - ${result.retryAfter}s retry`);

    return {
      allowed: false,
      response: Response.json(
        {
          error: 'Too many requests',
          message: `Rate limit exceeded. Please try again in ${result.retryAfter} seconds.`,
          retryAfter: result.retryAfter,
        },
        {
          status: 429,
          headers: {
            ...headers,
            'Retry-After': result.retryAfter?.toString() || '60',
          },
        }
      ),
      headers,
    };
  }

  return { allowed: true, headers };
}
