import { NextRequest, NextResponse } from "next/server";
import { handleVectorSearch, handlePerplexitySearch } from "@/lib/tools";

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
    const { query } = await request.json();

    if (!query) {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    // Step 1: Try vector search first
    const vectorResponse = await handleVectorSearch(query);
    let result = vectorResponse.text;
    let source =
      vectorResponse.store === "trade_in"
        ? "trade_in_vector_store"
        : "vector_store";
    let matches = vectorResponse.matches;

    // Step 2: If vector search returns a generic or short response, fall back to web search
    if (!result || result.length < 50 || result.includes("not found")) {
      console.log(
        `[Hybrid Search] Vector search for '${query}' was not sufficient, falling back to web search.`,
      );
      result = await handlePerplexitySearch(query);
      source = "perplexity";
    }

    return NextResponse.json(
      { result, source, matches },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("[Hybrid Search API] Error:", error);
    return NextResponse.json(
      { error: "Failed to process search request" },
      { status: 500, headers: corsHeaders },
    );
  }
}
