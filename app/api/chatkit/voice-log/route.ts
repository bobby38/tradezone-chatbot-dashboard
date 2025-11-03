"use server";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getClientIdentifier } from "@/lib/security/rateLimit";
import { ensureSession, getNextTurnIndex } from "@/lib/chatkit/sessionManager";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function validationError(message: string, origin: string | null) {
  return NextResponse.json(
    { success: false, error: message },
    { status: 400, headers: getCorsHeaders(origin) },
  );
}

const ALLOWED_ORIGINS = [
  "https://tradezone.sg",
  "https://www.tradezone.sg",
  "https://rezult.co",
  "https://www.rezult.co",
  "https://trade.rezult.co",
  ...(process.env.NODE_ENV === "development"
    ? ["http://localhost:3000", "http://localhost:3001"]
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

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { headers: getCorsHeaders(origin) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const clientIp = getClientIdentifier(req);

  try {
    const body = await req.json();
    const {
      sessionId,
      userId,
      userTranscript,
      assistantTranscript,
      startedAt,
      latencyMs,
      status = "success",
    } = body ?? {};

    if (!sessionId || typeof sessionId !== "string") {
      return validationError("sessionId is required", origin);
    }

    if (!userTranscript || typeof userTranscript !== "string") {
      return validationError("userTranscript is required", origin);
    }

    if (!assistantTranscript || typeof assistantTranscript !== "string") {
      return validationError("assistantTranscript is required", origin);
    }

    const normalizedStatus =
      status === "error" || status === "success" ? status : "success";
    const nowIso = new Date().toISOString();
    const sessionName = userTranscript.slice(0, 120);

    try {
      const ensuredSession = await ensureSession(supabase, {
        sessionId,
        userId: userId || sessionId,
        source: "chatkit",
        sessionName,
        clientIp,
        userAgent: req.headers.get("user-agent"),
        metadata: { channel: "voice" },
      });

      const turnIndex = await getNextTurnIndex(supabase, sessionId);

      const sessionDisplayName =
        ensuredSession.sessionName ||
        sessionName ||
        `Voice session ${nowIso.substring(0, 10)}`;

      await supabase.from("chat_logs").insert({
        session_id: sessionId,
        user_id: userId || sessionId,
        prompt: userTranscript,
        response: assistantTranscript,
        source: "chatkit_voice",
        status: normalizedStatus,
        turn_index: turnIndex,
        created_at: startedAt || nowIso,
        processing_time:
          typeof latencyMs === "number" && latencyMs >= 0 ? latencyMs : null,
        session_name: sessionDisplayName,
      });
    } catch (dbError) {
      console.error("[VoiceLog] Supabase insert failed:", dbError);
      return NextResponse.json(
        { success: false, error: "Failed to persist voice transcript" },
        { status: 500, headers: getCorsHeaders(origin) },
      );
    }

    return NextResponse.json(
      { success: true },
      { headers: getCorsHeaders(origin) },
    );
  } catch (error) {
    console.error("[VoiceLog] Unexpected error:", error);
    return NextResponse.json(
      { success: false, error: "Invalid request payload" },
      { status: 400, headers: getCorsHeaders(origin) },
    );
  }
}
