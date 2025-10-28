import { findCatalogMatches } from "@/lib/chatkit/productCatalog";

type VectorStoreLabel = "catalog" | "trade_in";

export interface VectorSearchContext {
  intent?: string;
  toolUsed?: string;
}

interface ResolvedVectorStore {
  id: string;
  label: VectorStoreLabel;
}

function resolveVectorStore(
  context?: VectorSearchContext,
): ResolvedVectorStore {
  const tradeInId = process.env.OPENAI_VECTOR_STORE_ID_TRADEIN;
  const catalogId =
    process.env.OPENAI_VECTOR_STORE_ID_CATALOG ||
    process.env.OPENAI_VECTOR_STORE_ID ||
    "vs_68e89cf979e88191bb8b4882caadbc0d";

  const prefersTradeIn =
    (context?.intent && context.intent.toLowerCase() === "trade_in") ||
    (context?.toolUsed && context.toolUsed.startsWith("tradein_"));

  // Log which store is being selected
  console.log("[VectorSearch] Resolve:", {
    prefersTradeIn,
    hasTradeInId: !!tradeInId,
    tradeInId: tradeInId?.substring(0, 15) + "..." || "NOT SET",
    catalogId: catalogId.substring(0, 15) + "...",
    contextIntent: context?.intent,
    contextToolUsed: context?.toolUsed,
  });

  if (prefersTradeIn && tradeInId) {
    console.log("[VectorSearch] ✅ Using TRADE-IN vector store:", tradeInId);
    return { id: tradeInId, label: "trade_in" };
  }

  console.log("[VectorSearch] Using CATALOG vector store:", catalogId);
  return { id: catalogId, label: "catalog" };
}

/**
 * Vector Search Tool for TradeZone Products
 * Uses OpenAI's Docling hybrid chunk vector store
 */

export const vectorSearchTool = {
  type: "function" as const,
  function: {
    name: "searchProducts",
    description:
      "PRIMARY TOOL: Use this FIRST for ALL product queries (prices, stock, specs, availability). Searches product catalog + live WooCommerce data. Covers: gaming consoles, laptops, phones, accessories, peripherals, trade-in valuations.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "The product search query or question about TradeZone products/services",
        },
      },
      required: ["query"],
    },
  },
};

/**
 * Handler function for vector search
 * Calls OpenAI Responses API with file_search tool
 */
export async function handleVectorSearch(
  query: string,
  context?: VectorSearchContext,
): Promise<{ text: string; store: VectorStoreLabel }> {
  const resolvedStore = resolveVectorStore(context);
  try {
    const { id: vectorStoreId, label } = resolvedStore;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        input: query,
        tools: [
          {
            type: "file_search",
            vector_store_ids: [vectorStoreId],
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("Vector search error:", error);
      throw new Error(
        `Vector search failed: ${error.error?.message || "Unknown error"}`,
      );
    }

    const data = await response.json();

    const result =
      data.output
        ?.flatMap((item: any) =>
          item.content
            ?.filter((block: any) => block.type === "output_text")
            ?.map((block: any) => block.text?.trim()),
        )
        ?.flat()
        ?.filter(Boolean)
        ?.join("\n\n") || "";

    let enriched = result;
    if (label === "catalog") {
      const catalogMatches = await findCatalogMatches(query, 3);

      if (catalogMatches.length > 0) {
        const lines = catalogMatches.map((match) => {
          const details: string[] = [];
          details.push(
            `- **${match.name}**${match.price ? ` — S$${match.price}` : ""}`,
          );
          if (match.stockStatus) {
            const humanStock =
              match.stockStatus === "instock"
                ? "In stock"
                : match.stockStatus === "outofstock"
                  ? "Out of stock"
                  : match.stockStatus;
            details.push(`  - Availability: ${humanStock}`);
          }
          if (match.permalink) {
            details.push(`  - [View Product](${match.permalink})`);
          }
          if (match.image) {
            details.push(`  - ![Product Image](${match.image})`);
          }
          return details.join("\n");
        });

        const section = ["**Online Store Matches**", ...lines].join("\n");
        enriched = enriched ? `${enriched}\n\n${section}` : section;
      }
    }

    if (enriched.trim().length === 0) {
      if (label === "trade_in") {
        const noMatchGuidance = [
          "TRADE_IN_NO_MATCH",
          "No trade-in pricing data found for this item in our catalog.",
          "Next steps:",
          "- Confirm the caller is in Singapore before continuing.",
          '- Let them know we need a manual review: "We don\'t have this device in our system yet. Want me to have TradeZone staff review it?"',
          "- Keep saving any trade-in details with tradein_update_lead.",
          '- If they confirm, collect name, phone, and email, then call sendemail with emailType:"contact" and include a note like "Manual trade-in review needed" plus the device details.',
          "- If they decline, explain we currently only accept the models listed on TradeZone.sg, and offer to check other items.",
        ].join("\n");

        return { text: noMatchGuidance, store: label };
      }

      return {
        text: "No product information found. Please try rephrasing your query.",
        store: label,
      };
    }

    return { text: enriched, store: label };
  } catch (error) {
    console.error("Error in vector search:", error);
    return {
      text: "I encountered an error searching our product database. Please try again or contact support.",
      store: resolvedStore.label,
    };
  }
}
