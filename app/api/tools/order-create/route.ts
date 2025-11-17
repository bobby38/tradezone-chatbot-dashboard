import { NextRequest, NextResponse } from "next/server";
import { createOrder } from "@/lib/agent-tools";

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
    if (typeof body.productId !== "string" || typeof body.paymentMethod !== "string") {
      return NextResponse.json(
        { error: "productId and paymentMethod are required" },
        { status: 400, headers: corsHeaders },
      );
    }
    const result = await createOrder({
      sessionId: body.sessionId,
      userId: body.userId,
      productId: body.productId,
      paymentMethod: body.paymentMethod,
      options: body.options ?? null,
    });
    return NextResponse.json(result, { headers: corsHeaders });
  } catch (error) {
    console.error("[order-create] failed", error);
    return NextResponse.json(
      { error: "Failed to create order" },
      { status: 500, headers: corsHeaders },
    );
  }
}
