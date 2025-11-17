import { NextRequest, NextResponse } from "next/server";
import { priceLookup } from "@/lib/agent-tools";

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
    const productId = typeof body.productId === "string" ? body.productId : "";
    const condition = typeof body.condition === "string" ? body.condition : undefined;
    const priceType =
      body.priceType === "retail" || body.priceType === "trade_in"
        ? body.priceType
        : "trade_in";
    if (!productId) {
      return NextResponse.json(
        { error: "productId is required" },
        { status: 400, headers: corsHeaders },
      );
    }
    const result = await priceLookup({ productId, condition, priceType });
    return NextResponse.json(result, { headers: corsHeaders });
  } catch (error) {
    console.error("[price-lookup] failed", error);
    return NextResponse.json(
      { error: "Failed to lookup price" },
      { status: 500, headers: corsHeaders },
    );
  }
}
