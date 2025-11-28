import {
  findCatalogMatches,
  type CatalogMatch,
} from "@/lib/chatkit/productCatalog";
import {
  findTradeInPriceMatch,
  formatPriceRange,
} from "@/lib/trade-in/priceLookup";
import {
  formatSGDPrice,
  formatSGDPriceShortOrNull,
} from "@/lib/tools/priceFormatter";
import type { WooProductSearchResult } from "@/lib/agent-tools";

type VectorStoreLabel = "catalog" | "trade_in";

const QUERY_STOP_WORDS = new Set([
  "any",
  "the",
  "this",
  "that",
  "with",
  "please",
  "thanks",
  "thank",
  "you",
  "got",
  "have",
  "need",
  "want",
  "for",
  "from",
  "your",
  "their",
  "its",
  "buy",
  "sell",
  "price",
  "prices",
  "gaming",
  "game",
  "games",
  "console",
  "consoles",
  "ps5",
  "ps4",
  "xbox",
  "series",
  "edition",
  "bundle",
]);

const GENERIC_QUERY_TOKENS = new Set([
  "gaming",
  "game",
  "games",
  "console",
  "consoles",
  "ps5",
  "ps4",
  "xbox",
  "series",
  "edition",
  "bundle",
  "pc",
  "gear",
]);

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
  return formatSGDPriceShortOrNull(value);
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
  wooProducts?: WooProductSearchResult[];
}

/**
 * Extract product category from query for better search filtering
 */
function extractProductCategory(query: string): string | null {
  const lower = query.toLowerCase();

  // Category detection patterns (order matters - check specific before general)
  const categoryPatterns = [
    {
      pattern:
        /\b(vr|virtual\s*reality|vr\s*headsets?|vr\s*glasses?|meta\s*quest|pico)\b/i,
      category: "vr",
    },
    {
      pattern: /\b(games?|gaming\s*titles?)\b/i,
      category: "games",
    },
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
      pattern: /\b(motherboards?|mobos?|mainboards?)\b/i,
      category: "motherboard",
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

function cleanQueryForSearch(query: string): string {
  // Remove price-related keywords that confuse WooCommerce search
  // These keywords guide LLM response but shouldn't filter products
  const priceKeywords =
    /\b(cheap|cheaper|cheapest|affordable|budget|inexpensive|expensive|premium|high-end|low-end|entry-level|best|top|popular|trending|any|some|all|under|below|above|over|less than|more than|around|approximately|between)\b/gi;
  const cleaned = query.replace(priceKeywords, "").replace(/\s+/g, " ").trim();

  if (cleaned !== query) {
    console.log(`[VectorSearch] Cleaned query: "${query}" → "${cleaned}"`);
  }

  return cleaned || query; // Return original if cleaning results in empty string
}

function extractQueryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter((token) => token.length >= 3 && !QUERY_STOP_WORDS.has(token));
}

function selectFilteringTokens(tokens: string[]): string[] {
  if (!tokens.length) return [];
  const specific = tokens.filter((token) => !GENERIC_QUERY_TOKENS.has(token));
  return specific.length ? specific : tokens;
}

type BudgetContext = {
  wantsCheap: boolean;
  maxBudget: number | null;
  cheapestPrice: number | null;
  cheapestWithinBudget: number | null;
  hasWithinBudget: boolean;
};

function parseMaxBudget(query: string): number | null {
  const lowered = query.toLowerCase();
  const patterns = [
    /(?:under|below|less than|underneath|upto|up to|<=)\s*(?:s?\$)?\s*(\d{2,5})/i,
    /(?:max|budget|cap)\s*(?:is|:)?\s*(?:s?\$)?\s*(\d{2,5})/i,
  ];
  for (const pattern of patterns) {
    const match = lowered.match(pattern);
    if (match && match[1]) {
      const value = Number(match[1]);
      if (Number.isFinite(value)) return value;
    }
  }
  const betweenMatch = lowered.match(
    /between\s+(?:s?\$)?\s*(\d{2,5})\s+(?:and|-|to)\s+(?:s?\$)?\s*(\d{2,5})/i,
  );
  if (betweenMatch) {
    const upper = Number(betweenMatch[2]);
    if (Number.isFinite(upper)) return upper;
  }
  return null;
}

function getProductPrice(product: WooProductSearchResult): number | null {
  const raw = product.price_sgd;
  if (raw == null) return null;
  const price = Number(raw);
  return Number.isFinite(price) ? price : null;
}

function createBudgetContext(
  query: string,
  products: WooProductSearchResult[],
): BudgetContext {
  const wantsCheap =
    /\b(cheap|cheaper|cheapest|affordable|budget|inexpensive)\b/i.test(query);
  const maxBudget = parseMaxBudget(query);
  const prices = products
    .map((product) => getProductPrice(product))
    .filter((price): price is number => price != null);
  const cheapestPrice = prices.length ? Math.min(...prices) : null;
  let cheapestWithinBudget: number | null = null;
  let hasWithinBudget = false;
  if (maxBudget != null && prices.length) {
    const within = prices.filter((price) => price <= maxBudget);
    if (within.length) {
      hasWithinBudget = true;
      cheapestWithinBudget = Math.min(...within);
    }
  }
  return {
    wantsCheap,
    maxBudget,
    cheapestPrice,
    cheapestWithinBudget,
    hasWithinBudget,
  };
}

function buildCategoryLabel(category: string | null): string {
  if (!category) return "options";
  return category.endsWith("s") ? category : `${category}s`;
}

function buildBudgetSummaryLine(
  ctx: BudgetContext,
  categoryLabel: string,
): string {
  if (!ctx.cheapestPrice) return "";
  if (ctx.maxBudget != null) {
    if (ctx.hasWithinBudget && ctx.cheapestWithinBudget != null) {
      return `Cheapest ${categoryLabel} within S$${ctx.maxBudget} start at ${formatSGDPrice(ctx.cheapestWithinBudget)}.`;
    }
    return `Cheapest ${categoryLabel} currently start at ${formatSGDPrice(ctx.cheapestPrice)}, which is above the requested S$${ctx.maxBudget} budget.`;
  }
  if (ctx.wantsCheap) {
    return `Cheapest ${categoryLabel} currently start at ${formatSGDPrice(ctx.cheapestPrice)}.`;
  }
  return "";
}

function buildBudgetInstructionText(
  ctx: BudgetContext,
  categoryLabel: string,
): string {
  if (ctx.maxBudget != null) {
    if (ctx.hasWithinBudget) {
      return `- Highlight only the ${categoryLabel} priced at or below S$${ctx.maxBudget} (already listed above).\n`;
    }
    if (ctx.cheapestPrice != null) {
      return `- NONE of the ${categoryLabel} are within S$${ctx.maxBudget}. Explicitly state the cheapest option is ${formatSGDPrice(ctx.cheapestPrice)} and ask if that's acceptable.\n`;
    }
  } else if (ctx.wantsCheap && ctx.cheapestPrice != null) {
    return `- Emphasize these are the cheapest ${categoryLabel} available (starting at ${formatSGDPrice(ctx.cheapestPrice)}).\n`;
  }
  return "";
}

function formatPriceWithBudget(
  price: number | null | undefined,
  ctx: BudgetContext,
): string {
  const formatted = formatSGDPrice(price);
  if (
    ctx.maxBudget != null &&
    typeof price === "number" &&
    Number(price) > ctx.maxBudget
  ) {
    return `${formatted} (above S$${ctx.maxBudget})`;
  }
  return formatted;
}

function filterWooResultsByTokens<T extends { name?: string }>(
  items: T[],
  tokens: string[],
): T[] {
  if (!tokens.length) return items;
  return items.filter((item) => {
    const hay = (item.name || "").toLowerCase();
    return tokens.some((token) => hay.includes(token));
  });
}

/**
 * Sort products by price based on user intent
 * "best/premium/expensive" → most expensive first
 * "cheap/affordable/budget" → cheapest first
 */
function sortProductsByPrice(
  products: Awaited<
    ReturnType<typeof import("@/lib/agent-tools").searchWooProducts>
  >,
  query: string,
): void {
  const wantsCheapest =
    /\b(cheap|cheaper|cheapest|affordable|budget|inexpensive)\b/i.test(query);
  const wantsBest = /\b(best|premium|expensive|high-end|top)\b/i.test(query);

  if (wantsCheapest && products.length > 0) {
    // Sort by price ascending (cheapest first)
    products.sort((a, b) => {
      const priceA = typeof a.price_sgd === "number" ? a.price_sgd : Infinity;
      const priceB = typeof b.price_sgd === "number" ? b.price_sgd : Infinity;
      return priceA - priceB;
    });
    console.log(
      `[VectorSearch] ✅ Sorted ${products.length} products by price (cheapest first)`,
    );
  } else if (wantsBest && products.length > 0) {
    // Sort by price descending (most expensive first)
    products.sort((a, b) => {
      const priceA = typeof a.price_sgd === "number" ? a.price_sgd : -Infinity;
      const priceB = typeof b.price_sgd === "number" ? b.price_sgd : -Infinity;
      return priceB - priceA;
    });
    console.log(
      `[VectorSearch] ✅ Sorted ${products.length} products by price (most expensive first)`,
    );
  }
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
  const queryTokens = extractQueryTokens(query);
  const filteringTokens = selectFilteringTokens(queryTokens);
  const detectedCategory = extractProductCategory(query);
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

  // SEARCH FLOW: WooCommerce → Vector → Graphiti → Perplexity
  // WooCommerce = source of truth (what we sell)
  // Vector/Graphiti/Perplexity = enrichment layers (add details/context)
  let wooProducts: Awaited<
    ReturnType<typeof import("@/lib/agent-tools").searchWooProducts>
  > = [];
  const wantsFullList = /\b(any|all|everything|list|show\s+me\s+all)\b/i.test(
    query,
  );
  const wooLimit = wantsFullList ? 20 : 12;
  const isTradeIntentContext =
    resolvedStore.label === "trade_in" ||
    (context?.intent && context.intent.toLowerCase() === "trade_in") ||
    (context?.toolUsed && context.toolUsed.startsWith("tradein_"));
  const tradeSnippet =
    priceListText && isTradeIntentContext ? priceListText : null;

  const prependTradeSnippet = (text: string) =>
    tradeSnippet ? `${tradeSnippet}\n\n${text}`.trim() : text;

  const detectPlatform = (name?: string) => {
    if (!name) return "other";
    const lower = name.toLowerCase();
    if (/\bps5\b|playstation\s*5/.test(lower)) return "ps5";
    if (/\bps4\b|playstation\s*4/.test(lower)) return "ps4";
    if (/\bxbox\b|series\s+[xs]/.test(lower)) return "xbox";
    if (/\bswitch\b|nintendo/.test(lower)) return "switch";
    if (/\bpc\b|\bsteam\b|\bwindows\b/.test(lower)) return "pc";
    if (/\bquest\b|psvr|vr\b/.test(lower)) return "vr";
    return "other";
  };

  const summarizePlatforms = (
    products: Awaited<
      ReturnType<typeof import("@/lib/agent-tools").searchWooProducts>
    >,
  ): string | null => {
    if (!products.length) return null;
    const counts: Record<string, number> = {
      ps5: 0,
      ps4: 0,
      xbox: 0,
      switch: 0,
      pc: 0,
      vr: 0,
      other: 0,
    };
    products.forEach((product) => {
      const key = detectPlatform(product.name);
      counts[key] = (counts[key] || 0) + 1;
    });
    const labels: Record<string, string> = {
      ps5: "PS5",
      ps4: "PS4",
      xbox: "Xbox",
      switch: "Switch",
      pc: "PC",
      vr: "VR",
      other: "Other",
    };
    const entries = Object.entries(counts)
      .filter(([, count]) => count > 0)
      .filter(([key]) => key !== "other" || Object.entries(counts).length === 1)
      .map(([key, count]) => `${labels[key] || key} (${count})`);
    if (entries.length <= 1) {
      return null;
    }
    return `Platforms available: ${entries.join(", ")}. Want a specific platform or title?`;
  };

  if (resolvedStore.label === "catalog") {
    try {
      console.log(
        `[VectorSearch] Step 1: Checking WooCommerce (source of truth)...`,
      );
      const { searchWooProducts } = await import("@/lib/agent-tools");

      // Query rewriting: map user terms to actual product names
      // Sports: basketball → nba, football → fifa, skateboard → tony hawk
      // Hardware: gpu → graphic card, console → playstation, gamepad → controller
      let searchQuery = query;
      const lowerQuery = query.toLowerCase();

      if (/\bgpu\b|graphics?\s*card/i.test(lowerQuery)) {
        searchQuery = searchQuery.replace(/\bgpu\b/gi, "graphic card");
        console.log(
          `[VectorSearch] GPU detected, searching for: "${searchQuery}"`,
        );
      } else if (/\bgamepad\b/i.test(lowerQuery)) {
        searchQuery = searchQuery.replace(/\bgamepad\b/gi, "controller");
        console.log(
          `[VectorSearch] Gamepad detected, searching for: "${searchQuery}"`,
        );
      } else if (/\bconsole\b/i.test(lowerQuery)) {
        // Replace "console" with brand name if specified, otherwise default to "playstation"
        if (/nintendo|switch/i.test(lowerQuery)) {
          searchQuery = searchQuery.replace(/\bconsole\b/gi, "nintendo");
        } else if (/xbox/i.test(lowerQuery)) {
          searchQuery = searchQuery.replace(/\bconsole\b/gi, "xbox");
        } else if (/playstation|ps\d/i.test(lowerQuery)) {
          searchQuery = searchQuery.replace(/\bconsole\b/gi, "playstation");
        } else {
          // Generic "console" without brand - default to playstation
          searchQuery = "playstation";
        }
        console.log(
          `[VectorSearch] Console query detected, searching for: "${searchQuery}"`,
        );
      } else if (/basketball|nba/i.test(lowerQuery)) {
        searchQuery = "nba 2k";
        console.log(
          `[VectorSearch] Basketball detected, searching for: "${searchQuery}"`,
        );
      } else if (
        /football|soccer/i.test(lowerQuery) &&
        !/american football/i.test(lowerQuery)
      ) {
        searchQuery = "fifa fc";
        console.log(
          `[VectorSearch] Football/soccer detected, searching for: "${searchQuery}"`,
        );
      } else if (
        /skateboard|skate/i.test(lowerQuery) &&
        !/ice skate/i.test(lowerQuery)
      ) {
        searchQuery = "tony hawk";
        console.log(
          `[VectorSearch] Skateboard detected, searching for: "${searchQuery}"`,
        );
      } else if (/wrestling|wwe/i.test(lowerQuery)) {
        searchQuery = "wwe 2k";
        console.log(
          `[VectorSearch] Wrestling detected, searching for: "${searchQuery}"`,
        );
      }

      const cleanedQuery = cleanQueryForSearch(searchQuery);
      wooProducts = await searchWooProducts(cleanedQuery, wooLimit);

      // Sort by price if user wants cheap options
      sortProductsByPrice(wooProducts, query);

      // Sport query canonical prioritization (Nov 26, 2025 - agent.md)
      // football/soccer → FIFA, basketball → NBA 2K, skateboard → Tony Hawk
      const SPORT_CANONICAL_MAP: Array<{ regex: RegExp; tokens: string[] }> = [
        { regex: /basketball|nba|2k/i, tokens: ["nba", "2k"] },
        {
          regex: /football|soccer|fifa|fc|ea sports/i,
          tokens: ["fifa", "fc", "football"],
        },
        { regex: /skateboard|skate|tony hawk/i, tokens: ["tony hawk", "thps"] },
        { regex: /wrestling|wwe|wwf/i, tokens: ["wwe", "wrestling", "2k"] },
      ];

      let sportTokens: string[] = [];
      SPORT_CANONICAL_MAP.forEach(({ regex, tokens }) => {
        if (regex.test(lowerQuery)) {
          sportTokens.push(...tokens.map((t) => t.toLowerCase()));
        }
      });

      if (sportTokens.length > 0 && wooProducts.length > 0) {
        console.log(
          `[VectorSearch] Sport query detected, prioritizing canonical titles:`,
          sportTokens,
        );
        const prioritized = wooProducts.filter((product) => {
          const hay = (product.name || "").toLowerCase();
          return sportTokens.some((token) => hay.includes(token));
        });
        if (prioritized.length > 0) {
          const remainder = wooProducts.filter(
            (product) => !prioritized.includes(product),
          );
          wooProducts = [...prioritized, ...remainder];
          console.log(
            `[VectorSearch] ✅ Re-ordered ${wooProducts.length} products, ${prioritized.length} canonical titles first`,
          );
        }
      }

      // VR filtering - move warranties/accessories to end
      if (detectedCategory === "vr" && wooProducts.length > 0) {
        const mainProducts: typeof wooProducts = [];
        const accessories: typeof wooProducts = [];

        wooProducts.forEach((product) => {
          const name = (product.name || "").toLowerCase();
          const isAccessory =
            /\b(warranty|extension|charging\s*station|demo\s*disc|controller|cable|case)\b/i.test(
              name,
            );

          if (isAccessory) {
            accessories.push(product);
          } else {
            mainProducts.push(product);
          }
        });

        wooProducts = [...mainProducts, ...accessories];
        console.log(
          `[VectorSearch] VR: Reordered ${mainProducts.length} main products, ${accessories.length} accessories`,
        );
      }

      // GPU/Graphics Card filtering (Nov 28, 2025)
      // When user asks for GPU/graphic card, ONLY return standalone cards, NOT full PCs
      if (detectedCategory === "gpu" && wooProducts.length > 0) {
        const beforeFilter = wooProducts.length;
        wooProducts = wooProducts.filter((product) => {
          const name = (product.name || "").toLowerCase();

          // Must contain GPU/graphics card indicators
          const hasGPUKeyword =
            /\b(graphic\s*card|graphics\s*card|gpu|video\s*card)\b/i.test(name);

          // Exclude if it's a full PC/system (even if it mentions GPU spec)
          const isFullPC =
            /\b(pc|desktop|computer|system|mini\s*itx|gaming\s*rig|tower|build|setup)\b/i.test(
              name,
            );

          // Exclude if product name contains CPU + RAM + Storage pattern (indicates full PC)
          const hasFullPCPattern =
            /\b(i[3579]-\d+|ryzen\s*[3579])\b.*\b\d+gb\b.*\b\d+tb\b/i.test(
              name,
            );

          // Keep ONLY if:
          // 1. Has GPU keyword AND
          // 2. NOT a full PC AND
          // 3. NOT a full PC config pattern
          return hasGPUKeyword && !isFullPC && !hasFullPCPattern;
        });
        console.log(
          `[VectorSearch] 🎮 GPU filter - ${beforeFilter} found, ${beforeFilter - wooProducts.length} full PCs excluded, ${wooProducts.length} graphic cards kept`,
        );
      }

      let budgetContext: BudgetContext | null = null;
      if (wooProducts.length > 0) {
        console.log(
          `[VectorSearch] ✅ WooCommerce found ${wooProducts.length} products - continuing to enrichment layers`,
        );
        budgetContext = createBudgetContext(query, wooProducts);
        if (budgetContext.maxBudget != null) {
          const within = wooProducts.filter((product) => {
            const price = getProductPrice(product);
            return price != null && price <= budgetContext.maxBudget!;
          });
          const above = wooProducts.filter(
            (product) => !within.includes(product),
          );
          if (within.length > 0) {
            wooProducts = [...within, ...above];
          }
        }
        if (wantsFullList) {
          const wooPayload = wooProducts.length > 0 ? wooProducts : undefined;

          // Detect series/franchise: if 3+ products share base name, limit to 5
          const baseNames = wooProducts.map((p) => {
            const name = (p.name || "").toLowerCase();
            return name
              .replace(
                /\s+(i{1,3}|iv|v|vi{1,3}|ix|x{1,3}|xl|l|\d+|edition|deluxe|standard|ps\d|xbox|switch|pc).*$/i,
                "",
              )
              .trim();
          });
          const baseNameCounts: Record<string, number> = {};
          baseNames.forEach((bn) => {
            if (bn) baseNameCounts[bn] = (baseNameCounts[bn] || 0) + 1;
          });
          const maxCount = Math.max(...Object.values(baseNameCounts));
          const isSeries = maxCount >= 3;

          const displayLimit = isSeries ? 5 : 8;
          const productsToShow = wooProducts.slice(0, displayLimit);
          const hasMore = wooProducts.length > displayLimit;

          const listText = productsToShow
            .map((product, idx) => {
              const price = formatPriceWithBudget(
                product.price_sgd,
                budgetContext!,
              );
              const url = product.permalink || `https://tradezone.sg`;
              const imageStr =
                idx === 0 && product.image
                  ? `\n   ![${product.name}](${product.image})`
                  : "";
              return `${idx + 1}. **${product.name}** — ${price}\n   [View Product](${url})${imageStr}`;
            })
            .join("\n\n");

          // Platform-specific game category links with new/pre-owned
          const getGamesCategoryLink = (query: string): string => {
            const lower = query.toLowerCase();
            const isPreOwned =
              /\b(pre[-\s]?owned|used|second[-\s]?hand)\b/i.test(lower);

            if (/\bps5\b|playstation\s*5/i.test(lower)) {
              return isPreOwned
                ? "https://tradezone.sg/product-category/playstation/playstation-5/pre-owned-games-playstation-5/"
                : "https://tradezone.sg/product-category/playstation/playstation-5/brand-new-games-playstation-5/";
            }
            if (/\bps4\b|playstation\s*4/i.test(lower)) {
              return isPreOwned
                ? "https://tradezone.sg/product-category/playstation/playstation-4/pre-owned-games-playstation-4/"
                : "https://tradezone.sg/product-category/playstation/playstation-4/brand-new-games-playstation-4/";
            }
            if (/\bxbox\s*(series\s*[xs]|one)/i.test(lower)) {
              return "https://tradezone.sg/product-category/xbox-item/";
            }
            if (/\bswitch\b|nintendo/i.test(lower)) {
              return "https://tradezone.sg/product-category/nintendo-switch/";
            }
            return "https://tradezone.sg/product-category/console-games/";
          };

          // Category link mapping
          const categoryLinks: Record<string, string> = {
            vr: "https://tradezone.sg/product-category/gadgets/virtual-reality-headset/",
            games: getGamesCategoryLink(query),
            laptop: "https://tradezone.sg/product-category/laptop/",
            phone: "https://tradezone.sg/product-category/phones/",
            tablet: "https://tradezone.sg/product-category/tablet/",
            console: "https://tradezone.sg/product-category/console-games/",
            gpu: "https://tradezone.sg/product-category/graphic-card/",
            motherboard: "https://tradezone.sg/product-category/motherboard/",
            handheld: "https://tradezone.sg/product-category/gaming-handheld/",
          };

          const categoryLink = detectedCategory
            ? categoryLinks[detectedCategory]
            : null;
          const moreText = hasMore
            ? `\n\n**Showing ${displayLimit} of ${wooProducts.length} results.** ${categoryLink ? `[View all ${detectedCategory}s on website](${categoryLink}) or ask for a specific title.` : "Ask for a specific title to see more."}`
            : "";

          const budgetCategoryLabel = buildCategoryLabel(detectedCategory);
          const budgetSummaryLine = buildBudgetSummaryLine(
            budgetContext!,
            budgetCategoryLabel,
          );
          const budgetInstruction = buildBudgetInstructionText(
            budgetContext!,
            budgetCategoryLabel,
          );
          const summaryPrefix = budgetSummaryLine
            ? `${budgetSummaryLine}\n\n`
            : "";
          const antiHallucinationNote =
            `\n\n${summaryPrefix}🔒 MANDATORY - Copy this EXACTLY to user:\n---START PRODUCT LIST---\n` +
            listText +
            "\n---END PRODUCT LIST---\n\n⚠️ CRITICAL: Copy the product list EXACTLY as shown above. Do NOT modify names, prices, or add products not in the list." +
            (budgetInstruction ? `\n${budgetInstruction}` : "");

          return {
            text: prependTradeSnippet(antiHallucinationNote),
            store: "product_catalog",
            matches: [],
            wooProducts: wooPayload,
          };
        }

        // 🔴 CRITICAL FIX: For phone/tablet/controller queries, skip vector enrichment
        // Vector store contains games/consoles that contaminate specific accessory results
        const isControllerQuery =
          /\b(gamepad|controller|pro\s*controller)\b/i.test(query);
        const skipVectorCategories = new Set(["phone", "tablet", "laptop"]);
        const isCategoryBlocked =
          !!detectedCategory && skipVectorCategories.has(detectedCategory);
        const skipVectorEnrichment = isCategoryBlocked || isControllerQuery;

        if (skipVectorEnrichment) {
          const categoryLabel = isControllerQuery
            ? "controller/gamepad"
            : detectedCategory;
          console.log(
            `[VectorSearch] 🚫 ${categoryLabel} query - returning WooCommerce ONLY (no vector contamination)`,
          );

          const wooPayload = wooProducts.length > 0 ? wooProducts : undefined;
          const activeBudgetContext =
            budgetContext || createBudgetContext(query, wooProducts);
          const wooSection = wooProducts
            .map((r, idx) => {
              const priceStr = formatPriceWithBudget(
                r.price_sgd,
                activeBudgetContext,
              );
              const urlStr = r.permalink || `https://tradezone.sg`;
              // Include image for first product only (not all products to avoid clutter)
              const imageStr =
                idx === 0 && r.image ? `\n   ![${r.name}](${r.image})` : "";
              return `${idx + 1}. **${r.name}** — ${priceStr}\n   [View Product](${urlStr})${imageStr}`;
            })
            .join("\n\n");

          const hasAffordableKeyword =
            /\b(cheap|affordable|budget|inexpensive)\b/i.test(query);
          const hasPriceRange = /\b(under|below|less than)\s+\$?\d+/i.test(
            query,
          );

          const affordableHint = hasAffordableKeyword
            ? "- User wants AFFORDABLE options - highlight the LOWEST PRICED items first\n"
            : "";
          const priceRangeHint = hasPriceRange
            ? "- User specified price range - show products within that range\n"
            : "";

          const budgetCategoryLabel = buildCategoryLabel(categoryLabel || null);
          const budgetSummaryLine = buildBudgetSummaryLine(
            activeBudgetContext,
            budgetCategoryLabel,
          );
          const budgetInstruction = buildBudgetInstructionText(
            activeBudgetContext,
            budgetCategoryLabel,
          );
          const summaryPrefix = budgetSummaryLine
            ? `${budgetSummaryLine}\n\n`
            : "";

          const antiHallucinationNote =
            `\n\n${summaryPrefix}🔒 MANDATORY RESPONSE FORMAT:\n---START PRODUCT LIST---\n` +
            wooSection +
            "\n---END PRODUCT LIST---\n\n⚠️ CRITICAL INSTRUCTIONS:\n- User's original query: \"" +
            query +
            '"\n- Show ALL ' +
            wooProducts.length +
            " products from the list above\n" +
            affordableHint +
            priceRangeHint +
            (budgetInstruction ? budgetInstruction : "") +
            '- NEVER say \"no products found\" or \"couldn\'t find\" - the list above IS what we have\n- NEVER add products not in the list (like Hades, iPhone SE, etc.)\n- Format: Brief intro + full product list with cheapest options highlighted';
          return {
            text: prependTradeSnippet(antiHallucinationNote),
            store: "product_catalog",
            matches: [],
            wooProducts: wooPayload,
          };
        }

        // Skip vector enrichment when WooCommerce has good results
        // Vector search is SLOW - only use for specific detail queries (specs, reviews, comparisons)
        const isDetailQuery =
          /\b(spec|specs|specification|review|reviews|compare|comparison|feature|features|detail|details|difference|vs|versus)\b/i.test(
            query,
          );
        const hasEnoughResults = wooProducts.length >= 3;

        if (!isDetailQuery && hasEnoughResults) {
          console.log(
            `[VectorSearch] ✅ Simple list query with ${wooProducts.length} WooCommerce results - returning WITHOUT vector enrichment (fast path)`,
          );

          const displayLimit = 8;
          const productsToShow = wooProducts.slice(0, displayLimit);
          const hasMore = wooProducts.length > displayLimit;

          const listText = productsToShow
            .map((product, idx) => {
              const price = formatSGDPrice(product.price_sgd);
              const url = product.permalink || `https://tradezone.sg`;
              const imageStr =
                idx === 0 && product.image
                  ? `\n   ![${product.name}](${product.image})`
                  : "";
              return `${idx + 1}. **${product.name}** — ${price}\n   [View Product](${url})${imageStr}`;
            })
            .join("\n\n");

          const moreText = hasMore
            ? `\n\nShowing ${displayLimit} of ${wooProducts.length} results. Ask for a specific title for more.`
            : "";

          const antiHallucinationNote =
            "\n\n🔒 MANDATORY - Copy this EXACTLY to user:\n---START PRODUCT LIST---\n" +
            listText +
            moreText +
            "\n---END PRODUCT LIST---\n\n⚠️ CRITICAL: Copy the product list EXACTLY as shown above (including the 'Showing X of Y' message if present). Do NOT modify names, prices, or add products not in the list.";

          return {
            text: prependTradeSnippet(antiHallucinationNote),
            store: "product_catalog",
            matches: [],
            wooProducts: wooProducts.length > 0 ? wooProducts : undefined,
          };
        }

        console.log(
          `[VectorSearch] Specific query or few results (${wooProducts.length}) - returning WooCommerce list to avoid hallucinations`,
        );
        const fallbackBudgetContext =
          budgetContext || createBudgetContext(query, wooProducts);
        const displayLimit = Math.min(wooProducts.length, 6);
        const productsToShow = wooProducts.slice(0, displayLimit);
        const listText = productsToShow
          .map((product, idx) => {
            const price = formatPriceWithBudget(
              product.price_sgd,
              fallbackBudgetContext,
            );
            const url = product.permalink || `https://tradezone.sg`;
            return `${idx + 1}. **${product.name}** — ${price}\n   [View Product](${url})`;
          })
          .join("\n\n");
        const budgetCategoryLabel = buildCategoryLabel(detectedCategory);
        const budgetSummaryLine = buildBudgetSummaryLine(
          fallbackBudgetContext,
          budgetCategoryLabel,
        );
        const summaryPrefix = budgetSummaryLine
          ? `${budgetSummaryLine}\n\n`
          : "";
        const budgetInstruction = buildBudgetInstructionText(
          fallbackBudgetContext,
          budgetCategoryLabel,
        );
        const fallbackNote =
          `\n\n${summaryPrefix}🔒 MANDATORY - Copy this EXACTLY to user:\n---START PRODUCT LIST---\n` +
          listText +
          "\n---END PRODUCT LIST---\n\n⚠️ CRITICAL: Copy the product list EXACTLY as shown above. Do NOT modify names, prices, or add products not in the list." +
          (budgetInstruction ? `\n${budgetInstruction}` : "");

        return {
          text: prependTradeSnippet(fallbackNote),
          store: "product_catalog",
          matches: [],
          wooProducts: wooProducts.length > 0 ? wooProducts : undefined,
        };
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
                  const cleanedFallbackQuery = cleanQueryForSearch(query);
                  const wooResults = await searchWooProducts(
                    cleanedFallbackQuery,
                    5,
                  );

                  // Sort by price if user wants cheap options
                  sortProductsByPrice(wooResults, query);

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
                        const price = formatSGDPrice(r.price_sgd);
                        const url = r.permalink || `https://tradezone.sg`;
                        // Include image for first product only
                        const imageStr =
                          idx === 0 && r.image
                            ? `\n   ![${r.name}](${r.image})`
                            : "";
                        return `${idx + 1}. ${r.name}\n   Price: ${price}\n   Link: ${url}${imageStr}`;
                      })
                      .join("\n\n");

                    const productType =
                      detectedCategory === "phone" ? "phone" : "tablet";
                    const plural = wooResults.length > 1 ? "s" : "";
                    return {
                      text:
                        "I found " +
                        wooResults.length +
                        " " +
                        productType +
                        " product" +
                        plural +
                        " in stock:\n\n" +
                        wooText +
                        "\n\nThese are the ONLY " +
                        detectedCategory +
                        " products currently available. For more options, visit https://tradezone.sg",
                      store: label,
                      matches: [],
                      wooProducts: wooResults,
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
                    wooProducts:
                      wooProducts.length > 0 ? wooProducts : undefined,
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
                wooProducts: wooProducts.length > 0 ? wooProducts : undefined,
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

    // Sports keyword filter to avoid generic console listings
    const lowerQuery = query.toLowerCase();
    const sportFilters: string[] = [];
    const SPORT_TOKEN_MAP: Array<{ regex: RegExp; tokens: string[] }> = [
      { regex: /basketball|nba|2k/i, tokens: ["nba", "2k"] },
      {
        regex: /football|soccer|fifa|fc ?24|ea sports fc/i,
        tokens: ["fifa", "fc", "football"],
      },
      { regex: /wrestling|wwe|wwf/i, tokens: ["wwe", "wrestling", "2k"] },
    ];

    SPORT_TOKEN_MAP.forEach(({ regex, tokens }) => {
      if (regex.test(lowerQuery)) {
        sportFilters.push(...tokens.map((t) => t.toLowerCase()));
      }
    });

    const applySportFilter = <T extends { name?: string }>(items: T[]) => {
      if (!sportFilters.length) return items;
      return items.filter((item) => {
        const hay = (item.name || "").toLowerCase();
        const hasSport = sportFilters.some((tok) => hay.includes(tok));
        const isGameLike = /\b(game|edition|2k|fc|fifa|nba|wwe)\b/i.test(
          item.name || "",
        );
        return hasSport && isGameLike;
      });
    };

    if (sportFilters.length && wooProducts.length) {
      wooProducts = applySportFilter(wooProducts);
    }
    if (sportFilters.length && catalogMatches.length) {
      catalogMatches = applySportFilter(catalogMatches);
    }

    const trimmedEnriched = enriched.trim();
    const totalWooCount = wooProducts.length;

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

        return {
          text: noMatchGuidance,
          store: label,
          matches: [],
          wooProducts: wooProducts.length > 0 ? wooProducts : undefined,
        };
      }

      return {
        text: "No matching products found. I can note this for staff and check availability for you—want me to do that?",
        store: label,
        matches: label === "catalog" ? [] : undefined,
        wooProducts: wooProducts.length > 0 ? wooProducts : undefined,
      };
    }

    // Step 4: Combine WooCommerce (source of truth) + Vector/Graphiti enrichment
    let finalText = "";

    if (sportFilters.length && wooProducts.length === 0) {
      finalText = `No matching products found for "${query}" right now. Want me to note it for staff and check availability for you?`;
    } else if (wooProducts.length > 0) {
      console.log(
        `[VectorSearch] Step 4: Combining WooCommerce products with vector enrichment`,
      );
      const displayLimit = Math.min(
        wooProducts.length,
        wantsFullList ? wooProducts.length : 8,
      );
      const wooSection = wooProducts
        .slice(0, displayLimit)
        .map((r, idx) => {
          const price = formatSGDPrice(r.price_sgd);
          const url = r.permalink || `https://tradezone.sg`;
          // Include image for first product only
          const imageStr =
            idx === 0 && r.image ? `\n   ![${r.name}](${r.image})` : "";
          // CRITICAL: Include product ID to force exact name usage
          return `${idx + 1}. **${r.name}** — ${price}\n   [View Product](${url})${imageStr}`;
        })
        .join("\n\n");

      // WooCommerce first, then vector enrichment (if any)
      const vectorEnrichment =
        trimmedEnriched && trimmedEnriched.length > 50
          ? `\n\n**Additional Context:**\n${trimmedEnriched}`
          : "";

      // ANTI-HALLUCINATION: Structured format that MUST be preserved exactly
      const antiHallucinationNote =
        "\n\n🔒 MANDATORY RESPONSE FORMAT - Copy this EXACTLY to user:\n---START PRODUCT LIST---\n" +
        wooSection +
        '\n---END PRODUCT LIST---\n\n⚠️ CRITICAL: You MUST copy the above product list EXACTLY as shown. Do NOT modify names, prices, or add products. Only add a brief intro line like "Here\'s what we have:" before the list.';
      const hiddenCount = totalWooCount - displayLimit;
      const platformSummary =
        totalWooCount > 6 ? summarizePlatforms(wooProducts) : null;
      const listNotes: string[] = [];
      if (hiddenCount > 0) {
        listNotes.push(
          `Showing ${displayLimit} of ${totalWooCount} items. Ask for a platform or title if you want the rest.`,
        );
      }
      if (platformSummary) {
        listNotes.push(platformSummary);
      }

      finalText =
        antiHallucinationNote +
        (listNotes.length ? "\n\n" + listNotes.join(" ") : "") +
        vectorEnrichment;
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
      wooProducts: wooProducts.length > 0 ? wooProducts : undefined,
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
      wooProducts: wooProducts.length > 0 ? wooProducts : undefined,
    };
  }
}
