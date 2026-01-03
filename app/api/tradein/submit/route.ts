import { NextRequest, NextResponse } from "next/server";
import {
  TradeInValidationError,
  submitTradeInLead,
} from "@/lib/trade-in/service";

const HANDLER_VERSION = "tradein-submit-2025-12-14";

const DEFAULT_STATUS_ON_SUBMIT = "in_review";

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
    const {
      leadId,
      sessionId,
      summary,
      notify = true,
      status = DEFAULT_STATUS_ON_SUBMIT,
    }: {
      leadId?: string;
      sessionId?: string;
      summary?: string;
      notify?: boolean;
      status?: string;
    } = body || {};

    // Accept either leadId or sessionId - if sessionId provided, find the lead first
    let finalLeadId = leadId;

    if (!finalLeadId && sessionId) {
      // Look up lead by session_id
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        },
      );

      const { data: lead, error } = await supabase
        .from("trade_in_leads")
        .select("id")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error || !lead) {
        return NextResponse.json(
          { error: `No trade-in lead found for session ${sessionId}` },
          { status: 404, headers: corsHeaders },
        );
      }

      finalLeadId = lead.id;
    }

    if (!finalLeadId) {
      return NextResponse.json(
        { error: "leadId or sessionId is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    try {
      const { lead, emailSent } = await submitTradeInLead({
        leadId: finalLeadId,
        summary,
        notify,
        status,
        emailContext: "initial",
      });

      console.log("[tradein/submit]", {
        requestId,
        handlerVersion: HANDLER_VERSION,
        finalLeadId,
        hadLeadId: Boolean(leadId),
        hadSessionId: Boolean(sessionId),
        emailSent,
        status: lead?.status,
      });

      return NextResponse.json(
        {
          success: true,
          requestId,
          handlerVersion: HANDLER_VERSION,
          lead,
          emailSent,
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

      console.error("[tradein/submit] Unexpected error", err);
      return NextResponse.json(
        { error: "Unable to submit trade-in lead" },
        { status: 500, headers: corsHeaders },
      );
    }
  } catch (error) {
    console.error("[tradein/submit] Unexpected error", error);
    return NextResponse.json(
      { error: "Unable to submit trade-in lead" },
      { status: 500, headers: corsHeaders },
    );
  }
}
