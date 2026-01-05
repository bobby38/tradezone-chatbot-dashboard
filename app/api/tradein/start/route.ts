import { NextRequest, NextResponse } from "next/server";
import { ensureTradeInLead, type TradeInChannel } from "@/lib/trade-in/service";

const HANDLER_VERSION = "tradein-start-2025-12-14";

// CORS headers
const ALLOWED_ORIGINS = [
  "https://tradezone.sg",
  "https://www.tradezone.sg",
  "https://trade.rezult.co",
  "https://rezult.co",
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
      origin.includes(allowed.replace("https://", "")),
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

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  try {
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const body = await request.json();
    const {
      clientId,
      sessionId,
      channel = "chat",
      initialMessage,
    }: {
      clientId?: string;
      sessionId?: string;
      channel?: TradeInChannel;
      initialMessage?: string;
    } = body || {};

    const identity = clientId || sessionId;

    if (!identity) {
      return NextResponse.json(
        { error: "clientId or sessionId is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    const { leadId, created } = await ensureTradeInLead({
      sessionId: sessionId || clientId || identity,
      leadHash: identity,
      channel,
      initialMessage,
      source: "api.tradein.start",
      maxAgeMinutes: 60,
    });

    console.log("[tradein/start]", {
      requestId,
      handlerVersion: HANDLER_VERSION,
      leadId,
      created,
      channel,
      clientId,
      sessionId,
      identity,
    });

    return NextResponse.json({
      success: true,
      requestId,
      handlerVersion: HANDLER_VERSION,
      leadId,
      existing: !created,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("[tradein/start] Unexpected error", error);
    return NextResponse.json(
      { error: "Unable to start trade-in lead" },
      { status: 500, headers: corsHeaders },
    );
  }
}
