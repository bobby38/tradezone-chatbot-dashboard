import { NextRequest, NextResponse } from "next/server";
import { handleVectorSearch, type VectorSearchContext } from "@/lib/tools";

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
    const { query, context } = await request.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    const vectorContext: VectorSearchContext | undefined =
      context && typeof context === "object" ? context : undefined;
    const vectorResponse = await handleVectorSearch(query, vectorContext);

    return NextResponse.json(
      {
        result: vectorResponse.text,
        store: vectorResponse.store,
        matches: vectorResponse.matches,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("[Vector Search API] Error:", error);
    return NextResponse.json(
      { error: "Failed to process vector search request" },
      { status: 500, headers: corsHeaders },
    );
  }
}
