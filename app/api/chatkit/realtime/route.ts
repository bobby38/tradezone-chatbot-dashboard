import { NextRequest, NextResponse } from "next/server";
import {
  getClientIdentifier,
  applyRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rateLimit";
import {
  verifyApiKey,
  verifyOrigin,
  authErrorResponse,
  originErrorResponse,
  isAuthRequired,
} from "@/lib/security/auth";
import { logSuspiciousActivity } from "@/lib/security/monitoring";
import {
  VOICE_SESSION_INSTRUCTIONS,
  VOICE_TOOL_DEFINITIONS,
} from "@/lib/chatkit/tradeInPrompts";

// CORS headers - Restrict to your domains only
const ALLOWED_ORIGINS = [
  "https://tradezone.sg",
  "https://www.tradezone.sg",
  "https://rezult.co",
  "https://www.rezult.co",
  "https://trade.rezult.co",
  "https://sabaisensations.com",
  "https://www.sabaisensations.com",
  ...(process.env.NODE_ENV === "development"
    ? [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3003",
      ]
    : []),
];

function getCorsHeaders(origin: string | null): HeadersInit {
  const allowedOrigin =
    origin &&
    ALLOWED_ORIGINS.some((allowed) =>
      origin.includes(allowed.replace("https://", "").replace("http://", "")),
    )
      ? origin
      : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

// Handle OPTIONS request for CORS preflight
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { headers: getCorsHeaders(origin) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const clientIp = getClientIdentifier(req);

  // Rate limiting
  const rateLimit = applyRateLimit(
    clientIp,
    RATE_LIMITS.REALTIME_CONFIG,
    "/api/chatkit/realtime",
  );

  if (!rateLimit.allowed) {
    await logSuspiciousActivity("rate_limit_hit", {
      clientIp,
      endpoint: "/api/chatkit/realtime",
      metadata: { reason: "realtime_config_rate_limit" },
    });
    const response = rateLimit.response!;
    const corsHeaders = getCorsHeaders(origin);
    Object.entries(corsHeaders).forEach(([key, value]) =>
      response.headers.set(key, value as string),
    );
    return response;
  }

  // Authentication
  if (isAuthRequired()) {
    const authResult = verifyApiKey(req);
    if (!authResult.authenticated) {
      await logSuspiciousActivity("auth_failure", {
        clientIp,
        endpoint: "/api/chatkit/realtime",
        metadata: { error: authResult.error },
      });
      return authErrorResponse(authResult.error, getCorsHeaders(origin));
    }

    if (!verifyOrigin(req)) {
      await logSuspiciousActivity("auth_failure", {
        clientIp,
        endpoint: "/api/chatkit/realtime",
        metadata: { reason: "invalid_origin", origin },
      });
      return originErrorResponse(getCorsHeaders(origin));
    }
  }

  try {
    const { sessionId } = await req.json();

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "Session ID is required" },
        { status: 400, headers: getCorsHeaders(origin) },
      );
    }

    // Realtime model: allow override; default to cost-efficient gpt-5-mini preview
    const model = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-mini";

    const config = {
      apiKey: process.env.OPENAI_API_KEY,
      websocketUrl: "wss://api.openai.com/v1/realtime",
      model,
      voice: "nova", // Female voice (warm, friendly)
      vectorStoreId: process.env.OPENAI_VECTOR_STORE_ID,

      // Full session configuration for both dashboard and widget
      sessionConfig: {
        modalities: ["text", "audio"],
        instructions: VOICE_SESSION_INSTRUCTIONS,
        input_audio_transcription: {
          model: "whisper-1",
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.55,
          prefix_padding_ms: 500,
          silence_duration_ms: 1200,
        },
        tools: VOICE_TOOL_DEFINITIONS,
        tool_choice: "auto",
      },
    };

    if (!config.apiKey || !config.vectorStoreId) {
      console.error("Missing OpenAI API key or Vector Store ID");
      return NextResponse.json(
        { success: false, error: "Server configuration missing" },
        { status: 500, headers: getCorsHeaders(origin) },
      );
    }

    return NextResponse.json(
      { success: true, config },
      { headers: getCorsHeaders(origin) },
    );
  } catch (error) {
    console.error("[Realtime API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500, headers: getCorsHeaders(origin) },
    );
  }
}
