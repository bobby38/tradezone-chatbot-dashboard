import { NextRequest, NextResponse } from "next/server";
import { calculateTopUp } from "@/lib/agent-tools";

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
    const target = Number(body.targetPrice);
    const trade = Number(body.tradeInValue);
    const discount = Number(body.usedDiscount || 0);

    if (!Number.isFinite(target) || !Number.isFinite(trade)) {
      return NextResponse.json(
        { error: "targetPrice and tradeInValue are required" },
        { status: 400, headers: corsHeaders },
      );
    }

    const result = calculateTopUp(target, trade, discount);
    return NextResponse.json(result, { headers: corsHeaders });
  } catch (error) {
    console.error("[calculate-top-up] failed", error);
    return NextResponse.json(
      { error: "Failed to calculate top up" },
      { status: 500, headers: corsHeaders },
    );
  }
}
