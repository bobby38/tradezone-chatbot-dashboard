/**
 * Authentication middleware for ChatKit endpoints
 * Prevents unauthorized access to chat APIs
 */

export interface AuthResult {
  authenticated: boolean;
  error?: string;
  userId?: string;
  source?: string;
}

/**
 * Verify API key from request headers
 *
 * Usage in your widget:
 * ```
 * fetch('/api/chatkit/agent', {
 *   method: 'POST',
 *   headers: {
 *     'Content-Type': 'application/json',
 *     'X-API-Key': 'your-api-key-here'
 *   },
 *   body: JSON.stringify({ message, sessionId })
 * })
 * ```
 */
export function verifyApiKey(request: Request): AuthResult {
  const apiKey = request.headers.get("x-api-key");
  const authHeader = request.headers.get("authorization");

  // Check X-API-Key header
  if (apiKey) {
    const validKeys = getValidApiKeys();

    if (validKeys.includes(apiKey)) {
      return {
        authenticated: true,
        userId: "api-key-user",
        source: "api-key",
      };
    }
  }

  // Check Authorization: Bearer token
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const validKeys = getValidApiKeys();

    if (validKeys.includes(token)) {
      return {
        authenticated: true,
        userId: "bearer-token-user",
        source: "bearer-token",
      };
    }
  }

  // Allow internal dashboard requests (same-origin from dashboard)
  const referer = request.headers.get("referer");
  const origin = request.headers.get("origin");

  if (
    referer?.includes("/dashboard/chat") ||
    origin?.includes("trade.rezult.co") ||
    origin?.includes("localhost")
  ) {
    return {
      authenticated: true,
      userId: "dashboard-user",
      source: "internal-dashboard",
    };
  }

  return {
    authenticated: false,
    error: "Invalid or missing API key",
  };
}

/**
 * Get valid API keys from environment
 * Supports multiple keys for different clients/environments
 */
function getValidApiKeys(): string[] {
  const keys: string[] = [];

  // Primary API key
  if (process.env.CHATKIT_API_KEY) {
    keys.push(process.env.CHATKIT_API_KEY);
  }

  // Widget-specific API key (for frontend)
  if (process.env.NEXT_PUBLIC_CHATKIT_WIDGET_KEY) {
    keys.push(process.env.NEXT_PUBLIC_CHATKIT_WIDGET_KEY);
  }

  // Additional keys (comma-separated)
  if (process.env.CHATKIT_ADDITIONAL_KEYS) {
    const additionalKeys = process.env.CHATKIT_ADDITIONAL_KEYS.split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
    keys.push(...additionalKeys);
  }

  return keys;
}

/**
 * Check if auth is required for this endpoint
 * Can disable in development or for specific routes
 */
export function isAuthRequired(): boolean {
  // Disable auth in development if flag is set
  if (
    process.env.NODE_ENV === "development" &&
    process.env.CHATKIT_DISABLE_AUTH === "true"
  ) {
    console.warn("[Auth] ⚠️  Authentication disabled in development mode");
    return false;
  }

  return true;
}

/**
 * Verify request origin for additional security
 */
export function verifyOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  const allowedOrigins = getAllowedOrigins();

  // Allow requests with no origin (server-to-server)
  if (!origin && !referer) {
    return true;
  }

  // Check origin
  if (origin && allowedOrigins.some((allowed) => origin.includes(allowed))) {
    return true;
  }

  // Check referer as fallback
  if (referer && allowedOrigins.some((allowed) => referer.includes(allowed))) {
    return true;
  }

  console.warn(
    "[Auth] Blocked request from unauthorized origin:",
    origin || referer,
  );
  return false;
}

/**
 * Get allowed origins from environment
 */
function getAllowedOrigins(): string[] {
  const origins = [
    "tradezone.sg",
    "rezult.co",
    "trade.rezult.co",
    "localhost",
    "127.0.0.1",
  ];

  // Add custom origins from env
  if (process.env.CHATKIT_ALLOWED_ORIGINS) {
    const customOrigins = process.env.CHATKIT_ALLOWED_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter((o) => o.length > 0);
    origins.push(...customOrigins);
  }

  return origins;
}

/**
 * Create authentication error response
 */
export function authErrorResponse(
  message: string = "Unauthorized",
  headers?: HeadersInit,
): Response {
  return Response.json(
    {
      error: "Authentication failed",
      message,
    },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Bearer realm="ChatKit API"',
        ...(headers || {}),
      },
    },
  );
}

/**
 * Create origin error response
 */
export function originErrorResponse(headers?: HeadersInit): Response {
  return Response.json(
    {
      error: "Forbidden",
      message: "Request origin not allowed",
    },
    { status: 403, headers: headers || {} },
  );
}

/**
 * Middleware wrapper to apply auth to route handlers
 */
export async function withAuth(
  request: Request,
  handler: (request: Request, auth: AuthResult) => Promise<Response>,
): Promise<Response> {
  // Check if auth is required
  if (!isAuthRequired()) {
    return handler(request, {
      authenticated: true,
      userId: "dev-user",
      source: "dev-mode",
    });
  }

  // Verify API key
  const authResult = verifyApiKey(request);
  if (!authResult.authenticated) {
    return authErrorResponse(authResult.error);
  }

  // Verify origin
  if (!verifyOrigin(request)) {
    return originErrorResponse();
  }

  // Call handler with auth context
  return handler(request, authResult);
}

/**
 * Generate a secure API key (for setup/rotation)
 */
export function generateApiKey(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const length = 32;
  let result = "tzck_"; // tradezone chatkit prefix

  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
}
