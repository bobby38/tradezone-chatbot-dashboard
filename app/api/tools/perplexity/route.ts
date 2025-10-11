import { NextRequest, NextResponse } from "next/server";
import { handleVectorSearch, handlePerplexitySearch } from "@/lib/tools";

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    // Step 1: Try vector search first
    let result = await handleVectorSearch(query);
    let source = "vector_store";

    // Step 2: If vector search returns a generic or short response, fall back to web search
    if (!result || result.length < 50 || result.includes("not found")) {
      console.log(
        `[Hybrid Search] Vector search for '${query}' was not sufficient, falling back to web search.`,
      );
      result = await handlePerplexitySearch(query);
      source = "perplexity";
    }

    return NextResponse.json({ result, source });
  } catch (error) {
    console.error("[Hybrid Search API] Error:", error);
    return NextResponse.json(
      { error: "Failed to process search request" },
      { status: 500 },
    );
  }
}
