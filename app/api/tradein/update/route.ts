import { NextRequest, NextResponse } from "next/server";
import {
  TradeInValidationError,
  updateTradeInLead,
  ensureTradeInLead,
} from "@/lib/trade-in/service";

const HANDLER_VERSION = "tradein-update-2025-12-14";

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
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  try {
    const body = await request.json();
    const { leadId, sessionId, ...updateFields } = body || {};

    // Accept either leadId or sessionId - create lead if needed
    let finalLeadId = leadId;

    if (!finalLeadId && sessionId) {
      // Ensure lead exists for this session
      const { leadId: newLeadId } = await ensureTradeInLead({
        sessionId,
        channel: "chat",
        source: "voice_chat",
      });
      finalLeadId = newLeadId;
    }

    if (!finalLeadId || typeof finalLeadId !== "string") {
      return NextResponse.json(
        { error: "leadId or sessionId is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    // Extract patch fields (everything except leadId and sessionId)
    const patch = updateFields;

    if (
      !patch ||
      typeof patch !== "object" ||
      Object.keys(patch).length === 0
    ) {
      return NextResponse.json(
        { error: "At least one field to update is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    try {
      const { lead } = await updateTradeInLead(finalLeadId, patch);
      console.log("[tradein/update]", {
        requestId,
        handlerVersion: HANDLER_VERSION,
        finalLeadId,
        hadLeadId: Boolean(leadId),
        hadSessionId: Boolean(sessionId),
        patchKeys: Object.keys(patch || {}),
      });
      return NextResponse.json(
        {
          success: true,
          requestId,
          handlerVersion: HANDLER_VERSION,
          lead,
        },
        { headers: corsHeaders },
      );
    } catch (err) {
      if (err instanceof TradeInValidationError) {
        return NextResponse.json(
          {
            error: err.message,
            fields: err.fields,
            requestId,
            handlerVersion: HANDLER_VERSION,
          },
          { status: 400, headers: corsHeaders },
        );
      }

      console.error("[tradein/update] Unexpected error", err);
      return NextResponse.json(
        { error: "Failed to update trade-in lead" },
        { status: 500, headers: corsHeaders },
      );
    }
  } catch (error) {
    console.error("[tradein/update] Unexpected error", error);
    return NextResponse.json(
      { error: "Unable to update trade-in lead" },
      { status: 500, headers: corsHeaders },
    );
  }
}
