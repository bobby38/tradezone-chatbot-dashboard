import { NextRequest, NextResponse } from "next/server";
import { handleVectorSearch } from "@/lib/tools";

// CORS headers for widget on tradezone.sg
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
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
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
    const { query } = await request.json();

    if (!query) {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    console.log("[Vector Search API] Query:", query);

    const { text: result, store, matches } = await handleVectorSearch(query);

    console.log(
      "[Vector Search API] Result length:",
      result.length,
      "store:",
      store,
    );

    return NextResponse.json(
      { result, store, matches },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("[Vector Search API] Error:", error);
    return NextResponse.json(
      {
        error: "Vector search failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers: corsHeaders },
    );
  }
}

// Health check
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  return NextResponse.json(
    {
      status: "healthy",
      service: "Vector Search API",
      timestamp: new Date().toISOString(),
    },
    { headers: corsHeaders },
  );
}
