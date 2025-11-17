import { NextRequest, NextResponse } from "next/server";
import { enqueueHumanReview } from "@/lib/agent-tools";

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
  return new NextResponse(null, { headers: getCorsHeaders(origin) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  try {
    const body = await request.json();
    if (typeof body.sessionId !== "string" || typeof body.reason !== "string") {
      return NextResponse.json(
        { error: "sessionId and reason are required" },
        { status: 400, headers: corsHeaders },
      );
    }
    const result = await enqueueHumanReview({
      sessionId: body.sessionId,
      reason: body.reason,
      payload: body.payload ?? null,
    });
    return NextResponse.json(result, { headers: corsHeaders });
  } catch (error) {
    console.error("[enqueue-human-review] failed", error);
    return NextResponse.json(
      { error: "Failed to enqueue review" },
      { status: 500, headers: corsHeaders },
    );
  }
}
