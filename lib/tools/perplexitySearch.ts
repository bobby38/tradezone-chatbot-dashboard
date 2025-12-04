/**
 * Perplexity Web Search Tool
 * Searches tradezone.sg domain using Perplexity AI
 */

export const perplexitySearchTool = {
  type: "function" as const,
  function: {
    name: "searchtool",
    description:
      'FALLBACK TOOL: Use ONLY if searchProducts returns "No product information" or for non-product queries (policies, promotions, store info, guides, warranty). Searches tradezone.sg website content.',
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query for TradeZone.sg website",
        },
      },
      required: ["query"],
    },
  },
};

/**
 * Handler function for Perplexity search with optional domain filter
 * @param query - Search query
 * @param domains - Optional array of domains to restrict search (e.g., ["tradezone.sg"])
 */
export async function handlePerplexitySearchWithDomain(
  query: string,
  domains?: string[],
): Promise<string> {
  try {
    const perplexityKey = process.env.PERPLEXITY_API_KEY;

    if (!perplexityKey) {
      console.warn("Perplexity API key not configured, skipping web search");
      return "Web search is currently unavailable. Please try using product search instead.";
    }

    const searchScope = domains ? `${domains.join(", ")} only` : "the web";
    const systemPrompt = domains
      ? `Search ${searchScope} for relevant information. Provide concise, accurate answers.`
      : "Search the web for relevant information. Provide concise, accurate answers with sources.";

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${perplexityKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar-pro",
        ...(domains && { search_domain_filter: domains }),
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: query,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("Perplexity search error:", error);
      throw new Error(
        `Perplexity search failed: ${error.error?.message || "Unknown error"}`,
      );
    }

    const data = await response.json();
    return (
      data.choices?.[0]?.message?.content ||
      `No results found${domains ? ` on ${domains.join(", ")}` : ""}`
    );
  } catch (error) {
    console.error("Error in Perplexity search:", error);
    return "I encountered an error searching. Please try again.";
  }
}

/**
 * Handler function for Perplexity search
 * Uses Perplexity API with domain filter (tradezone.sg only)
 */
export async function handlePerplexitySearch(query: string): Promise<string> {
  return handlePerplexitySearchWithDomain(query, ["tradezone.sg"]);
}
