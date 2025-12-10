import { NextRequest, NextResponse } from "next/server";
import { handleVectorSearch, handlePerplexitySearch } from "@/lib/tools";
import {
  verifyApiKey,
  authErrorResponse,
  isAuthRequired,
} from "@/lib/security/auth";

/**
 * Unified search endpoint for Python LiveKit agent
 * Handles both product catalog and website searches
 */
export async function POST(req: NextRequest) {
  // Authentication
  if (isAuthRequired()) {
    const authResult = verifyApiKey(req);
    if (!authResult.authenticated) {
      return authErrorResponse(authResult.error);
    }
  }

  try {
    const { query, context } = await req.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { success: false, error: "Query is required" },
        { status: 400 },
      );
    }

    // Determine search context
    const searchContext =
      context === "catalog" ? "trade_in_vector_store" : undefined;

    // Try vector search first
    const vectorResult = await handleVectorSearch(query, searchContext);

    if (vectorResult && vectorResult.length > 0) {
      return NextResponse.json({
        success: true,
        result: formatSearchResults(vectorResult),
      });
    }

    // Fallback to Perplexity for website queries
    if (context !== "catalog") {
      const perplexityResult = await handlePerplexitySearch(query);
      if (perplexityResult) {
        return NextResponse.json({
          success: true,
          result: perplexityResult,
        });
      }
    }

    return NextResponse.json({
      success: true,
      result: "No results found for your query.",
    });
  } catch (error) {
    console.error("[Search API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Search failed",
      },
      { status: 500 },
    );
  }
}

/**
 * Format search results for voice agent
 * Keep it concise for TTS
 */
function formatSearchResults(results: string): string {
  // Extract product listings from markdown
  const productMatches = results.match(/\*\*(.+?)\*\* — S\$(\d+(?:\.\d{2})?)/g);

  if (productMatches && productMatches.length > 0) {
    // Voice-friendly format: "Found 3 products: Product A at $X, Product B at $Y..."
    const products = productMatches
      .slice(0, 5) // Max 5 products for voice
      .map((match) => {
        const [, name, price] = match.match(
          /\*\*(.+?)\*\* — S\$(\d+(?:\.\d{2})?)/,
        ) || [];
        return `${name} at S$${price}`;
      })
      .filter(Boolean);

    if (products.length > 0) {
      return `Found ${products.length} products: ${products.join(", ")}. Want more details on any of these?`;
    }
  }

  // Return as-is if no special formatting needed
  return results;
}
