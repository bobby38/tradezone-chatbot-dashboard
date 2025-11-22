import {
  findCatalogMatches,
  type CatalogMatch,
} from "@/lib/chatkit/productCatalog";

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

function normalizeProductUrl(url: string): string {
  return url.replace(/\/+$/, "").toLowerCase();
}

function parsePrice(value?: string | null): number | null {
  if (!value) return null;
  const numeric = parseFloat(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function formatCurrency(value?: number | null): string | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return `S$${value.toFixed(0)}`;
}

function formatRange(
  range?: { min: number | null; max: number | null } | null,
): string | null {
  if (!range) return null;
  const { min, max } = range;
  if (typeof min !== "number" || typeof max !== "number") return null;
  if (min === max) {
    return `${formatCurrency(min)}`;
  }
  return `${formatCurrency(min)}–${formatCurrency(max)}`;
}

function enforceCatalogPermalinks(
  text: string,
  matches: CatalogMatch[],
): string {
  if (!text) return text;

  const links = matches
    .map((match) => match.permalink)
    .filter((link): link is string => Boolean(link));

  if (links.length === 0) {
    return text;
  }

  const normalizedLinks = links.map(normalizeProductUrl);

  return text.replace(
    /https:\/\/tradezone\.sg\/product\/[a-z0-9\-]+\/?/gi,
    (candidate) => {
      const normalizedCandidate = normalizeProductUrl(candidate);
      const exactIndex = normalizedLinks.findIndex(
        (link) => link === normalizedCandidate,
      );
      if (exactIndex >= 0) {
        return links[exactIndex]!;
      }
      return links[0]!;
    },
  );
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
export interface VectorSearchResult {
  text: string;
  store: VectorStoreLabel;
  matches?: CatalogMatch[];
}

/**
 * Extract product category from query for better search filtering
 */
function extractProductCategory(query: string): string | null {
  const lower = query.toLowerCase();

  // Category detection patterns (order matters - check specific before general)
  const categoryPatterns = [
    {
      pattern: /\b(laptop|notebook|ultrabook|gaming\s*laptop)\b/i,
      category: "laptop",
    },
    { pattern: /\b(desktop|pc|tower|gaming\s*pc)\b/i, category: "desktop" },
    {
      pattern: /\b(graphics?\s*card|gpu|video\s*card|rtx|gtx|radeon)\b/i,
      category: "gpu",
    },
    {
      pattern: /\b(console|playstation|ps[1-5]|xbox|nintendo|switch)\b/i,
      category: "console",
    },
    {
      pattern: /\b(handheld|steam\s*deck|rog\s*ally|legion\s*go|switch)\b/i,
      category: "handheld",
    },
    {
      pattern: /\b(phone|mobile|smartphone|iphone|samsung\s*galaxy)\b/i,
      category: "phone",
    },
    { pattern: /\b(tablet|ipad)\b/i, category: "tablet" },
    { pattern: /\b(monitor|display|screen)\b/i, category: "monitor" },
    { pattern: /\b(keyboard|mechanical\s*keyboard)\b/i, category: "keyboard" },
    { pattern: /\b(mouse|gaming\s*mouse)\b/i, category: "mouse" },
    { pattern: /\b(headset|headphone|earphone)\b/i, category: "audio" },
  ];

  for (const { pattern, category } of categoryPatterns) {
    if (pattern.test(lower)) {
      return category;
    }
  }

  return null;
}

/**
 * Enhance query with category context for better search results
 */
function enrichQueryWithCategory(query: string): string {
  const category = extractProductCategory(query);

  if (!category) {
    return query;
  }

  // Add category-specific context to improve search accuracy
  const categoryHints: Record<string, string> = {
    laptop: "gaming laptop computer with",
    desktop: "desktop gaming PC with",
    gpu: "graphics card GPU component",
    console: "gaming console system",
    handheld: "portable gaming handheld device",
    phone: "mobile phone smartphone",
    tablet: "tablet device",
    monitor: "gaming monitor display",
    keyboard: "mechanical gaming keyboard",
    mouse: "gaming mouse",
    audio: "gaming headset audio",
  };

  const hint = categoryHints[category];
  if (hint) {
    console.log(
      `[VectorSearch] Detected category: ${category} (enrichment disabled)`,
    );
    // Disabled enrichment - it was causing irrelevant matches
    // return `${hint} ${query}`;
  }

  return query;
}

export async function handleVectorSearch(
  query: string,
  context?: VectorSearchContext,
): Promise<VectorSearchResult> {
  const resolvedStore = resolveVectorStore(context);
  const enrichedQuery = enrichQueryWithCategory(query); // Returns original query now

  // PRIORITY 1: WooCommerce is SINGLE SOURCE OF TRUTH for ALL product queries
  // Check WooCommerce FIRST - if not there, don't waste time with other searches
  if (resolvedStore.label === "catalog") {
    try {
      console.log(
        `[VectorSearch] PRIORITY 1: Searching WooCommerce (single source of truth)...`,
      );
      const { searchWooProducts } = await import("@/lib/agent-tools");
      const wooResults = await searchWooProducts(query, 5);

      if (wooResults.length > 0) {
        console.log(
          `[VectorSearch] ✅ WooCommerce found ${wooResults.length} products`,
          wooResults.map((r) => ({
            name: r.name,
            permalink: r.permalink,
            price: r.price_sgd,
          })),
        );

        const wooText = wooResults
          .map((r, idx) => {
            const price = r.price_sgd
              ? `S$${r.price_sgd.toFixed(2)}`
              : "Price not available";
            const url = r.permalink || `https://tradezone.sg`;
            return `${idx + 1}. ${r.name}\n   Price: ${price}\n   Link: ${url}`;
          })
          .join("\n\n");

        return {
          text: `I found ${wooResults.length} product${wooResults.length > 1 ? "s" : ""} in stock:\n\n${wooText}\n\nFor more details, visit https://tradezone.sg`,
          store: resolvedStore.label,
          matches: [],
        };
      } else {
        console.log(
          `[VectorSearch] ❌ No WooCommerce matches - product not in catalog`,
        );
        // If not in WooCommerce, tell user directly - don't waste time with vector/zep/perplexity
        return {
          text: `I don't have "${query}" in our product catalog. Please check https://tradezone.sg for our current inventory, or let me know if you'd like help with something else.`,
          store: resolvedStore.label,
          matches: [],
        };
      }
    } catch (wooError) {
      console.error(
        `[VectorSearch] WooCommerce search failed, falling back to vector:`,
        wooError,
      );
      // Only fall back to vector if WooCommerce search itself failed (technical error)
    }
  }

  // PRIORITY 2: Fall back to Vector DB search
  try {
    const { id: vectorStoreId, label } = resolvedStore;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: enrichedQuery, // Use enriched query with category context
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

    let catalogMatches: Awaited<ReturnType<typeof findCatalogMatches>> = [];
    if (label === "catalog") {
      try {
        catalogMatches = await findCatalogMatches(query, 3);
        console.log(
          `[VectorSearch] Catalog matches found: ${catalogMatches.length}`,
        );
        if (catalogMatches.length > 0) {
          console.log(
            `[VectorSearch] Top match: ${catalogMatches[0].name} - ${catalogMatches[0].price || "N/A"}`,
          );

          // Detect category mismatch (e.g., searching for phones but getting games)
          const detectedCategory = extractProductCategory(query);
          if (detectedCategory && catalogMatches.length > 0) {
            const topMatchName = catalogMatches[0].name.toLowerCase();
            const categoryMismatch =
              (detectedCategory === "phone" &&
                !topMatchName.includes("phone") &&
                !topMatchName.includes("iphone") &&
                !topMatchName.includes("samsung") &&
                !topMatchName.includes("pixel") &&
                !topMatchName.includes("galaxy")) ||
              (detectedCategory === "laptop" &&
                !topMatchName.includes("laptop") &&
                !topMatchName.includes("notebook") &&
                !topMatchName.includes("macbook")) ||
              (detectedCategory === "tablet" &&
                !topMatchName.includes("tablet") &&
                !topMatchName.includes("ipad"));

            if (categoryMismatch) {
              console.warn(
                `[VectorSearch] Category mismatch detected: query="${query}", category="${detectedCategory}", topMatch="${catalogMatches[0].name}"`,
              );

              // Try WooCommerce direct search as fallback for phones/tablets
              if (
                detectedCategory === "phone" ||
                detectedCategory === "tablet"
              ) {
                try {
                  console.log(
                    `[VectorSearch] Attempting WooCommerce fallback for ${detectedCategory}...`,
                  );
                  const { searchWooProducts } = await import(
                    "@/lib/agent-tools"
                  );
                  const wooResults = await searchWooProducts(query, 5);

                  if (wooResults.length > 0) {
                    console.log(
                      `[VectorSearch] Found ${wooResults.length} WooCommerce matches for ${detectedCategory}`,
                      wooResults.map((r) => ({
                        name: r.name,
                        permalink: r.permalink,
                        price: r.price_sgd,
                      })),
                    );

                    const wooText = wooResults
                      .map((r, idx) => {
                        const price = r.price_sgd
                          ? `S$${r.price_sgd.toFixed(2)}`
                          : "Price not available";
                        const url = r.permalink || `https://tradezone.sg`;
                        return `${idx + 1}. ${r.name}\n   Price: ${price}\n   Link: ${url}`;
                      })
                      .join("\n\n");

                    return {
                      text: `I found ${wooResults.length} ${detectedCategory === "phone" ? "phone" : "tablet"} product${wooResults.length > 1 ? "s" : ""} in stock:\n\n${wooText}\n\nThese are the ONLY ${detectedCategory} products currently available. For more options, visit https://tradezone.sg`,
                      store: label,
                      matches: [],
                    };
                  } else {
                    console.log(
                      `[VectorSearch] No WooCommerce matches found for ${detectedCategory}`,
                    );
                  }
                } catch (wooError) {
                  console.error(
                    `[VectorSearch] WooCommerce fallback failed:`,
                    wooError,
                  );
                }
              }

              // Fallback message if WooCommerce search also fails
              return {
                text: `I don't have ${detectedCategory === "phone" ? "phones" : detectedCategory === "laptop" ? "laptops" : detectedCategory + "s"} in my current product database. Please check our website at https://tradezone.sg for our latest ${detectedCategory} inventory, or I can help you with gaming consoles and accessories instead.`,
                store: label,
                matches: [],
              };
            }
          }
        }
      } catch (catalogError) {
        console.error("[VectorSearch] Catalog fallback error:", catalogError);
        catalogMatches = [];
      }
    }

    const sanitizedResult =
      label === "catalog" && catalogMatches.length > 0
        ? enforceCatalogPermalinks(result, catalogMatches)
        : result;

    let enriched = sanitizedResult;
    let priceSpreadNote = "";
    if (label === "catalog" && catalogMatches.length > 0) {
      const mentionAtome = /\batome\b/i.test(query);
      const mentionBnpl =
        mentionAtome ||
        /\b(bnpl|instal|installment|instalment|pay\s?later|grabpay|spay)\b/i.test(
          query,
        );
      if (
        sanitizedResult &&
        /couldn'?t find|cannot find|no listing|no results/i.test(
          sanitizedResult.toLowerCase(),
        )
      ) {
        enriched = "";
      }

      const lines = catalogMatches.map((match) => {
        const details: string[] = [];
        const flagshipPrice =
          match.flagshipCondition?.basePrice !== undefined &&
          match.flagshipCondition?.basePrice !== null
            ? `${formatCurrency(match.flagshipCondition?.basePrice)} (${match.flagshipCondition?.label})`
            : match.price
              ? `S$${match.price}`
              : null;
        details.push(
          `- **${match.name}**${flagshipPrice ? ` — ${flagshipPrice}` : ""}`,
        );

        const variantRange = formatRange(match.priceRange);
        if (variantRange) {
          details.push(`  - Variants: ${variantRange}`);
        }

        const tradeSummaries = match.conditions
          .map((condition) => {
            const trade = condition.tradeIn;
            if (!trade) return null;
            const min = trade.min ?? trade.max ?? null;
            const max = trade.max ?? trade.min ?? null;
            if (min === null && max === null) return null;
            if (min !== null && max !== null && min !== max) {
              return `${condition.label} ${formatCurrency(min)}–${formatCurrency(max)}`;
            }
            const value = min ?? max;
            if (value === null) return null;
            return `${condition.label} ${formatCurrency(value)}`;
          })
          .filter((note): note is string => Boolean(note));
        if (tradeSummaries.length) {
          details.push(`  - Trade-in: ${tradeSummaries.join("; ")}`);
        }

        const bnplPlans = match.flagshipCondition?.bnpl ?? [];
        if (bnplPlans.length) {
          const prioritizedPlans = mentionAtome
            ? [
                ...bnplPlans.filter((plan) => plan.providerId === "atome"),
                ...bnplPlans.filter((plan) => plan.providerId !== "atome"),
              ]
            : bnplPlans;
          const bnplPreview = prioritizedPlans
            .slice(0, mentionBnpl ? 3 : 2)
            .map(
              (plan) =>
                `${plan.providerName} ${plan.months}x ${formatCurrency(plan.monthly)}`,
            )
            .filter(Boolean)
            .join(", ");
          if (bnplPreview) {
            details.push(`  - Instalments: ${bnplPreview}`);
          }
        }

        if (match.permalink) {
          details.push(`  - [View Product](${match.permalink})`);
        }
        if ((match as any).image) {
          details.push(`  - ![Product Image](${(match as any).image})`);
        }
        return details.join("\n");
      });

      const section = ["**Online Store Matches**", ...lines].join("\n");
      enriched = enriched ? `${enriched}\n\n${section}` : section;

      const spreadSource =
        catalogMatches.find(
          (match) =>
            match.familyRange &&
            typeof match.familyRange.min === "number" &&
            typeof match.familyRange.max === "number" &&
            match.familyRange.max - match.familyRange.min >= 150,
        ) || null;

      if (spreadSource) {
        priceSpreadNote = `This product family spans ${formatRange(spreadSource.familyRange)} depending on bundles or conditions. Let me know if you prefer brand-new, pre-owned, or a specific bundle.`;
      } else {
        const numericPrices = catalogMatches
          .map((match) => parsePrice(match.price))
          .filter((price): price is number => price !== null);
        if (numericPrices.length >= 2) {
          const minPrice = Math.min(...numericPrices);
          const maxPrice = Math.max(...numericPrices);
          if (maxPrice - minPrice >= 200) {
            priceSpreadNote = `Prices range widely (${formatCurrency(minPrice)}–${formatCurrency(
              maxPrice,
            )}). Which version or condition do you prefer?`;
          }
        }
      }
    }

    const trimmedEnriched = enriched.trim();

    if (trimmedEnriched.length === 0) {
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

        return { text: noMatchGuidance, store: label, matches: [] };
      }

      return {
        text: "No product information found. Please try rephrasing your query.",
        store: label,
        matches: label === "catalog" ? [] : undefined,
      };
    }

    const finalText =
      priceSpreadNote && label === "catalog"
        ? `${trimmedEnriched}\n\n${priceSpreadNote}`
        : trimmedEnriched;

    return {
      text: finalText,
      store: label,
      matches: label === "catalog" ? catalogMatches : undefined,
    };
  } catch (error) {
    console.error("Error in vector search:", error);
    return {
      text: "I encountered an error searching our product database. Please try again or contact support.",
      store: resolvedStore.label,
      matches: resolvedStore.label === "catalog" ? [] : undefined,
    };
  }
}
