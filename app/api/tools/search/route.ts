import { NextRequest, NextResponse } from "next/server";
import { handleVectorSearch, handlePerplexitySearch } from "@/lib/tools";
import { searchWooProducts } from "@/lib/agent-tools";
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

    // Detect trade-in intent
    const isTradeInQuery =
      /trade[-\s]?in|sell|buyback|cash for|upgrade.*for|swap.*for/i.test(query);

    // Use handleVectorSearch (same as text chat) - it handles trade-in pricing automatically
    const searchContext =
      context === "catalog"
        ? {
            intent: isTradeInQuery ? "trade_in" : "product",
            toolUsed: "searchProducts",
          }
        : context === "website"
          ? { intent: "general", toolUsed: "searchtool" }
          : undefined;

    console.log("[Search API] Using handleVectorSearch:", {
      query,
      context: searchContext,
      isTradeInQuery,
    });

    const vectorResult = await handleVectorSearch(query, searchContext);

    if (vectorResult && vectorResult.text) {
      let responseText = vectorResult.text;

      // Add SSML for proper price pronunciation (100 dollars instead of 1-0-0 dollars)
      responseText = responseText.replace(
        /S\$(\d+(?:,\d{3})*(?:\.\d{2})?)/g,
        "$1 dollars",
      );

      return NextResponse.json({
        success: true,
        result: responseText,
        products: vectorResult.wooProducts || [],
        store: vectorResult.store,
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
        const [, name, price] =
          match.match(/\*\*(.+?)\*\* — S\$(\d+(?:\.\d{2})?)/) || [];
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
