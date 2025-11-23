import {
  findCatalogMatches,
  type CatalogMatch,
} from "@/lib/chatkit/productCatalog";
import {
  findTradeInPriceMatch,
  formatPriceRange,
} from "@/lib/trade-in/priceLookup";
import { formatSGDPrice } from "@/lib/tools/priceFormatter";

type VectorStoreLabel = "catalog" | "trade_in";

export interface VectorSearchContext {
  intent?: string;
  toolUsed?: string;
  tradeDeviceQuery?: string;
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
  // CRITICAL: Use concatenation not template literal to avoid Next.js compilation error
  return "S$" + value.toFixed(0);
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
      pattern: /\b(laptops?|notebooks?|ultrabooks?|gaming\s*laptops?)\b/i,
      category: "laptop",
    },
    {
      pattern: /\b(desktops?|pcs?|towers?|gaming\s*pcs?)\b/i,
      category: "desktop",
    },
    {
      pattern: /\b(graphics?\s*cards?|gpus?|video\s*cards?|rtx|gtx|radeon)\b/i,
      category: "gpu",
    },
    {
      pattern: /\b(consoles?|playstation|ps[1-5]|xbox|nintendo|switch)\b/i,
      category: "console",
    },
    {
      pattern:
        /\b(handhelds?|steam\s*decks?|rog\s*allys?|legion\s*gos?|switch)\b/i,
      category: "handheld",
    },
    {
      pattern: /\b(phones?|mobiles?|smartphones?|iphone|samsung\s*galaxy)\b/i,
      category: "phone",
    },
    { pattern: /\b(tablets?|ipads?)\b/i, category: "tablet" },
    { pattern: /\b(monitors?|displays?|screens?)\b/i, category: "monitor" },
    {
      pattern: /\b(keyboards?|mechanical\s*keyboards?)\b/i,
      category: "keyboard",
    },
    {
      pattern: /\b(mice|mouses?|gaming\s*mice|gaming\s*mouses?)\b/i,
      category: "mouse",
    },
    { pattern: /\b(headsets?|headphones?|earphones?)\b/i, category: "audio" },
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

function formatTradeInResponse(
  match: ReturnType<typeof findTradeInPriceMatch>,
): string {
  if (!match) return "I don't have that in the trade-in list yet.";
  const parts: string[] = [];
  if (match.preowned) {
    parts.push(`Preowned: ${formatPriceRange(match.preowned)}`);
  }
  if (match.brandNew) {
    parts.push(`Brand new: ${formatPriceRange(match.brandNew)}`);
  }
  const detail = parts.length ? parts.join(" · ") : "No pricing available";
  return `${match.label} — ${detail}. Subject to inspection.`;
}

export async function handleVectorSearch(
  query: string,
  context?: VectorSearchContext,
): Promise<VectorSearchResult> {
  const resolvedStore = resolveVectorStore(context);
  const enrichedQuery = enrichQueryWithCategory(query); // Returns original query now
  const tradeQueryOverride = context?.tradeDeviceQuery?.trim();
  let priceListMatch = tradeQueryOverride
    ? findTradeInPriceMatch(tradeQueryOverride)
    : null;
  if (!priceListMatch) {
    priceListMatch = findTradeInPriceMatch(query);
  }
  const priceListText = priceListMatch
    ? formatTradeInResponse(priceListMatch)
    : null;

  // SEARCH FLOW: WooCommerce → Vector → Zep → Perplexity
  // WooCommerce = source of truth (what we sell)
  // Vector/Zep/Perplexity = enrichment layers (add details/context)
  let wooProducts: Awaited<
    ReturnType<typeof import("@/lib/agent-tools").searchWooProducts>
  > = [];
  const wantsFullList = /\b(any|all|everything|list|show\s+me\s+all)\b/i.test(
    query,
  );
  const wooLimit = wantsFullList ? 20 : 5;
  const isTradeIntentContext =
    resolvedStore.label === "trade_in" ||
    (context?.intent && context.intent.toLowerCase() === "trade_in") ||
    (context?.toolUsed && context.toolUsed.startsWith("tradein_"));
  const tradeSnippet =
    priceListText && isTradeIntentContext ? priceListText : null;

  if (resolvedStore.label === "catalog") {
    try {
      console.log(
        `[VectorSearch] Step 1: Checking WooCommerce (source of truth)...`,
      );
      const { searchWooProducts } = await import("@/lib/agent-tools");
      wooProducts = await searchWooProducts(query, wooLimit);

      if (wooProducts.length > 0) {
        console.log(
          `[VectorSearch] ✅ WooCommerce found ${wooProducts.length} products - continuing to enrichment layers`,
          wooProducts.map((r) => ({
            name: r.name,
            permalink: r.permalink,
            price: r.price_sgd,
          })),
        );
        if (wantsFullList) {
          const listText = wooProducts
            .map((product, idx) => {
              const priceLabel =
                typeof product.price_sgd === "number"
                  ? " — S$" + product.price_sgd.toFixed(2)
                  : "";
              const link = product.permalink
                ? ` ([View Product](${product.permalink}))`
                : "";
              return `${idx + 1}. ${product.name}${priceLabel}${link}`;
            })
            .join("\n");
          return {
            text: prependTradeSnippet(
              `Here’s everything I have for “${query}” right now:\n\n${listText}\n\nPick one and I’ll pull the specs or availability.`,
            ),
            store: "product_catalog",
            matches: [],
          };
        }

        // 🔴 CRITICAL FIX: For phone/tablet queries, skip vector enrichment
        // Vector store contains games (Hades) that contaminate phone results
        const detectedCategory = extractProductCategory(query);
        const isPhoneOrTabletQuery =
          detectedCategory === "phone" || detectedCategory === "tablet";

        if (isPhoneOrTabletQuery) {
          console.log(
            `[VectorSearch] 🚫 Phone/tablet query - returning WooCommerce ONLY (no vector contamination)`,
          );

          const wooSection = wooProducts
            .map((r, idx) => {
              const priceStr = formatSGDPrice(r.price_sgd);
              const urlStr = r.permalink || `https://tradezone.sg`;
              return `${idx + 1}. **${r.name}** — ${priceStr}\n   Product Link: ${urlStr}`;
            })
            .join("\n\n");

          const antiHallucinationNote = `\n\n🔒 MANDATORY RESPONSE FORMAT:\n---START PRODUCT LIST---\n${wooSection}\n---END PRODUCT LIST---\n\n⚠️ CRITICAL INSTRUCTIONS:\n- You MUST show ALL products from the list above\n- Do NOT filter or hide products based on price keywords (cheap, affordable, expensive, etc.)\n- If user asked for "cheap" or "affordable", recommend the LOWEST PRICED items from the list\n- If user asked for price range (under X, below Y), recommend items within that range from the list\n- NEVER say "no products found" or "couldn't find" - the list above contains available products\n- NEVER add products not in the list (like Hades, iPhone SE, etc.)\n- Show the full list with a brief intro mentioning the cheapest/best options for their budget`;

          const finalText = `**WooCommerce Live Data (${wooProducts.length} products found):**\n\n${antiHallucinationNote}`;

          return {
            text: prependTradeSnippet(finalText),
            store: "product_catalog",
            matches: [],
          };
        }

        console.log(
          `[VectorSearch] Non-phone query - continuing to vector enrichment`,
        );
        // Continue to vector/zep/perplexity for enrichment
      } else {
        console.log(
          `[VectorSearch] ❌ No WooCommerce matches - continuing to vector search for enrichment`,
        );
        // Flag to check if we should use Perplexity fallback later
        const detectedCategory = extractProductCategory(query);
        if (detectedCategory === "phone" || detectedCategory === "tablet") {
          console.log(
            `[VectorSearch] Detected ${detectedCategory} query with no WooCommerce results - will use Perplexity if vector search also fails`,
          );
        }
        // Continue to vector search - it might find related products or categories
      }
    } catch (wooError) {
      console.error(
        `[VectorSearch] WooCommerce search failed, continuing to vector:`,
        wooError,
      );
      // Continue to vector search even if WooCommerce fails
    }
  }

  const prependTradeSnippet = (text: string) =>
    tradeSnippet ? `${tradeSnippet}\n\n${text}`.trim() : text;

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
                          ? "S$" + r.price_sgd.toFixed(2)
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

              // Final fallback: Use Perplexity to search the actual website
              console.log(
                `[VectorSearch] Attempting Perplexity search for ${detectedCategory}...`,
              );
              try {
                const { handlePerplexitySearch } = await import(
                  "./perplexitySearch"
                );
                const perplexityQuery = `What ${detectedCategory} products does tradezone.sg currently have in stock? List product names and prices.`;
                const perplexityResult =
                  await handlePerplexitySearch(perplexityQuery);

                if (
                  perplexityResult &&
                  !perplexityResult.includes("No results found") &&
                  !perplexityResult.includes("error")
                ) {
                  console.log(
                    `[VectorSearch] ✅ Perplexity found results for ${detectedCategory}`,
                  );
                  return {
                    text: perplexityResult,
                    store: label,
                    matches: [],
                  };
                }
              } catch (perplexityError) {
                console.error(
                  `[VectorSearch] Perplexity search failed:`,
                  perplexityError,
                );
              }

              // Ultimate fallback message
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
              ? "S$" + match.price
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

    // Step 4: Combine WooCommerce (source of truth) + Vector/Zep enrichment
    let finalText = "";

    if (wooProducts.length > 0) {
      console.log(
        `[VectorSearch] Step 4: Combining WooCommerce products with vector enrichment`,
      );
      const wooSection = wooProducts
        .map((r, idx) => {
          const price = r.price_sgd
            ? "S$" + r.price_sgd.toFixed(2)
            : "Price not available";
          const url = r.permalink || `https://tradezone.sg`;
          // CRITICAL: Include product ID to force exact name usage
          return `${idx + 1}. **${r.name}** — ${price}\n   Product Link: ${url}\n   Product ID: ${r.productId}`;
        })
        .join("\n\n");

      // WooCommerce first, then vector enrichment (if any)
      const vectorEnrichment =
        trimmedEnriched && trimmedEnriched.length > 50
          ? `\n\n**Additional Context:**\n${trimmedEnriched}`
          : "";

      // ANTI-HALLUCINATION: Structured format that MUST be preserved exactly
      const antiHallucinationNote = `\n\n🔒 MANDATORY RESPONSE FORMAT - Copy this EXACTLY to user:\n---START PRODUCT LIST---\n${wooSection}\n---END PRODUCT LIST---\n\n⚠️ CRITICAL: You MUST copy the above product list EXACTLY as shown. Do NOT modify names, prices, or add products. Only add a brief intro line like "Here's what we have:" before the list.`;

      finalText = `**WooCommerce Live Data (${wooProducts.length} products found):**\n\n${antiHallucinationNote}${vectorEnrichment}`;
    } else {
      // No WooCommerce products, just use vector/enrichment
      finalText =
        priceSpreadNote && label === "catalog"
          ? `${trimmedEnriched}\n\n${priceSpreadNote}`
          : trimmedEnriched;
    }

    return {
      text: prependTradeSnippet(finalText),
      store: label,
      matches: label === "catalog" ? catalogMatches : undefined,
    };
  } catch (error) {
    console.error("Error in vector search:", error);
    const errorText = prependTradeSnippet(
      "I encountered an error searching our product database. Please try again or contact support.",
    );
    return {
      text: errorText,
      store: resolvedStore.label,
      matches: resolvedStore.label === "catalog" ? [] : undefined,
    };
  }
}
