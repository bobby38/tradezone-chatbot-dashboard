import { NextRequest, NextResponse } from "next/server";
import { handleVectorSearch, handlePerplexitySearch } from "@/lib/tools";

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    console.log("[Search Tool] Query:", query);

    // STEP 1: Search vector store first (Docling hybrid chunks)
    console.log("[Search Tool] Searching vector store...");
    const vectorResult = await handleVectorSearch(query);

    // Check if vector search returned useful results
    const unhelpfulPhrases = [
      "No product information found",
      "error",
      "How can I assist",
      "Please clarify",
      "Could you please clarify",
      "What would you like to know",
      "Let me know how",
      "Can you provide more details",
      "I need more information",
      "uploaded some files", // Generic response from vector store
    ];

    const isUnhelpful = unhelpfulPhrases.some((phrase) =>
      vectorResult.toLowerCase().includes(phrase.toLowerCase()),
    );

    const hasUsefulResult =
      vectorResult &&
      !isUnhelpful &&
      vectorResult.length > 50 && // Minimum length
      (vectorResult.includes("S$") || // Has pricing
        vectorResult.includes("stock") || // Has stock info
        vectorResult.includes("View Product") || // Has product links
        vectorResult.includes("**") || // Has markdown formatting (product names)
        vectorResult.includes("tradezone.sg/product")); // Has product URLs

    if (hasUsefulResult) {
      console.log("[Search Tool] ✅ Vector store found products");
      return NextResponse.json({
        result: vectorResult,
        source: "vector_store",
      });
    }

    // STEP 2: Fallback to Perplexity if vector store has no answer
    console.log(
      "[Search Tool] Vector store returned no results, using Perplexity fallback...",
    );
    const perplexityResult = await handlePerplexitySearch({ query });

    return NextResponse.json({
      result: perplexityResult,
      source: "perplexity",
    });
  } catch (error) {
    console.error("[Search Tool Error]:", error);
    return NextResponse.json({ error: "Failed to search" }, { status: 500 });
  }
}
