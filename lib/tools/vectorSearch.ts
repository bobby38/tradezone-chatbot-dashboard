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
import {
  CATEGORY_SLUG_MAP,
  DIRECT_CATEGORY_SET,
  getWooProductsByCategory,
} from "@/lib/agent-tools";

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
  // 🚨 REMOVED: "gaming", "game", "games" - CRITICAL for game searches
  // 🚨 REMOVED: "console", "consoles" - needed for console-specific searches
  // 🚨 REMOVED: "ps5", "ps4", "xbox", "series" - CRITICAL platform identifiers
  // 🚨 REMOVED: "edition", "bundle" - Important product variations
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
    {
      pattern: /\b(gaming\s*chairs?|chairs?|seatzone)\b/i,
      category: "chair",
    },
    {
      pattern:
        /\b(cpu\s*coolers?|cpu\s*fan|aio\s*(cooler|liquid)|liquid\s*cooler|heatsink|radiator)\b/i,
      category: "cpu_cooler",
    },
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
    {
      pattern:
        /\b(hdd|hard\s*drive|harddrive|ssd|nvme|storage|m\.2|solid\s*state)\b/i,
      category: "storage",
    },
    {
      pattern:
        /\b(cameras?|action\s*cams?|vlog|vlogging|youtube|dslr|mirrorless)\b/i,
      category: "camera",
    },
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
  // Remove price-related keywords and noise words that confuse WooCommerce search
  // These keywords guide LLM response but shouldn't filter products
  const noiseKeywords =
    /\b(cheap|cheaper|cheapest|affordable|budget|inexpensive|expensive|premium|high-end|low-end|entry-level|best|top|popular|trending|any|some|all|under|below|above|over|less than|more than|around|approximately|between|or)\b/gi;
  const cleaned = query.replace(noiseKeywords, "").replace(/\s+/g, " ").trim();

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
  const normalized = category.replace(/_/g, " ");
  return normalized.endsWith("s") ? normalized : `${normalized}s`;
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

/**
 * Standardized category link mapping for "view all" links
 */
function getCategoryLink(
  category: string | null,
  query: string,
): string | null {
  if (!category) return null;

  const getGamesCategoryLink = (q: string): string => {
    const lower = q.toLowerCase();
    const isPreOwned = /\b(pre-?owned|used|second-?hand)\b/i.test(lower);
    if (/\bps5\b|playstation\s*5/i.test(lower)) {
      return isPreOwned
        ? "https://tradezone.sg/product-category/playstation/playstation-5/pre-owned-games/"
        : "https://tradezone.sg/product-category/playstation/playstation-5/brand-new-games/";
    }
    if (/\bps4\b|playstation\s*4/i.test(lower)) {
      return isPreOwned
        ? "https://tradezone.sg/product-category/playstation/playstation-4/pre-owned-games/"
        : "https://tradezone.sg/product-category/playstation/playstation-4/brand-new-games/";
    }
    if (/\bxbox\s*(series\s*[xs]|one)/i.test(lower)) {
      return "https://tradezone.sg/product-category/xbox-item/";
    }
    if (/\bswitch\b|nintendo|pokemon|pokémon/i.test(lower)) {
      return isPreOwned
        ? "https://tradezone.sg/product-category/nintendo/pre-owned-games-nintendo/"
        : "https://tradezone.sg/product-category/nintendo/brand-new-games-nintendo/";
    }
    return "https://tradezone.sg/product-category/console-games/";
  };

  const categoryLinks: Record<string, string> = {
    vr: "https://tradezone.sg/product-category/gadgets/virtual-reality-headset/",
    games: getGamesCategoryLink(query),
    laptop: "https://tradezone.sg/product-category/laptop/",
    phone: "https://tradezone.sg/product-category/handphone-tablet/handphone/",
    tablet: "https://tradezone.sg/product-category/handphone-tablet/tablet/",
    console: "https://tradezone.sg/product-category/gadgets/consoles/",
    gpu: "https://tradezone.sg/product-category/graphic-card/",
    motherboard: "https://tradezone.sg/product-category/motherboard/",
    handheld: "https://tradezone.sg/product-category/gadgets/",
    storage:
      "https://tradezone.sg/product-category/pc-related/pc-parts/storage/",
  };

  return categoryLinks[category] || null;
}

/**
 * Properly pluralize category names
 */
function pluralizeCategory(category: string): string {
  // Special cases that don't need 's' or have irregular plurals
  const irregularPlurals: Record<string, string> = {
    games: "games",
    storage: "storage devices",
    mouse: "mice",
  };

  if (irregularPlurals[category]) {
    return irregularPlurals[category];
  }

  // Default: add 's'
  return `${category}s`;
}

/**
 * Standardized "more results" text with category links
 */
function buildMoreResultsText(
  displayLimit: number,
  totalCount: number,
  category: string | null,
  query: string,
): string {
  const hasMore = totalCount > displayLimit;
  const categoryLink = getCategoryLink(category, query);

  // Check if this is a game query showing brand new games (not pre-owned)
  const isGameQuery = category === "games" && /\b(game|games)\b/i.test(query);
  const wantsPreOwned = /\b(pre-?owned|used|second-?hand)\b/i.test(query);
  const preOwnedHint =
    isGameQuery && !wantsPreOwned
      ? "\n\n💡 *These are brand new games. Want to see pre-owned options? Just ask!*"
      : "";

  // If showing all results, just show count + category link (no "show more" needed)
  if (!hasMore) {
    if (categoryLink && category) {
      const categoryPlural = pluralizeCategory(category);
      return `\n\n**Showing all ${totalCount} results.** [View all ${categoryPlural} on website](${categoryLink})${preOwnedHint}`;
    }
    return preOwnedHint || ""; // Show pre-owned hint even without category link
  }

  // Has more results - show pagination with "show more" option
  const remaining = totalCount - displayLimit;

  if (categoryLink && category) {
    const categoryPlural = pluralizeCategory(category);
    return `\n\n**Showing ${displayLimit} of ${totalCount} results.** Type "show more" to see the remaining ${remaining}, or [View all ${categoryPlural} on website](${categoryLink}).${preOwnedHint}`;
  }

  return `\n\nShowing ${displayLimit} of ${totalCount} results. Type "show more" to see the remaining ${remaining}.${preOwnedHint}`;
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
  let detectedCategory = extractProductCategory(query);
  // Hard override to avoid mis-detection for critical categories
  if (/\btablet\b/i.test(query)) detectedCategory = "tablet";
  if (/\b(phone|handphone|mobile|smartphone)\b/i.test(query))
    detectedCategory = "phone";
  // Hard override to avoid mis-detection
  if (/\btablet\b/i.test(query)) {
    detectedCategory = "tablet" as any;
  }
  if (/\b(phone|handphone|mobile|smartphone)\b/i.test(query)) {
    detectedCategory = "phone" as any;
  }
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

  if (detectedCategory && DIRECT_CATEGORY_SET.has(detectedCategory)) {
    const slugs = CATEGORY_SLUG_MAP[detectedCategory] || [];
    const directResults = await getWooProductsByCategory(
      slugs,
      wooLimit,
      "asc",
    );
    if (directResults.length) {
      console.log(
        `[VectorSearch] Direct ${detectedCategory} category load: ${directResults.length} items`,
        directResults.map((p) => p.name),
      );

      const directBudgetContext = createBudgetContext(query, directResults);
      const budgetCategoryLabel = buildCategoryLabel(detectedCategory);
      const budgetSummaryLine = buildBudgetSummaryLine(
        directBudgetContext,
        budgetCategoryLabel,
      );
      const summaryPrefix = budgetSummaryLine ? `${budgetSummaryLine}\n\n` : "";

      const listText = directResults
        .map((product, idx) => {
          const price = formatPriceWithBudget(
            product.price_sgd,
            directBudgetContext,
          );
          const url = product.permalink || `https://tradezone.sg`;
          const imageStr =
            idx === 0 && product.image
              ? `\n   ![${product.name}](${product.image})`
              : "";
          return `${idx + 1}. **${product.name}** — ${price}\n   [View Product](${url})${imageStr}`;
        })
        .join("\n\n");

      // Show ALL products - no clarification needed for direct categories
      // Customer needs to see full inventory to make purchase decision
      const intro = `Here's what we have (${directResults.length} products):\n\n`;
      const deterministicResponse = `${summaryPrefix}${intro}${listText}`;
      const responseText = `<<<DETERMINISTIC_START>>>${prependTradeSnippet(deterministicResponse)}<<<DETERMINISTIC_END>>>`;

      return {
        text: responseText,
        store: resolvedStore.label,
        matches: [],
        wooProducts: directResults,
      };
    }
  }

  // Early sale/promo/latest intent: use Perplexity live lookup, skip Woo/vector
  const saleIntentEarly =
    /\b(black\s*friday|cyber\s*monday|bf\s*deal|sale|deals?|promo|promotion|discount)\b/i.test(
      query.toLowerCase(),
    );
  if (saleIntentEarly) {
    const promoLine =
      "Flash sale unlocked ⚡ 5% off with code “TZSALE”. Check promos here: https://tradezone.sg/?s=promotion&post_type=product&dgwt_wcas=1 or tell me a product and I'll check it.";

    return {
      text: promoLine,
      store: resolvedStore.label,
      matches: [],
      wooProducts: [],
    };
  }

  // Lightweight entity → token hints to make implicit queries smarter without LLM prompts
  const ENTITY_HINT_MAP: Array<{ regex: RegExp; tokens: string[] }> = [
    {
      regex:
        /\bronald|messi|madrid|barca|barcelona|man\s*united|man\s*u\b|liverpool|premier\s+league|fifa\b|fc\s2[34]/i,
      tokens: ["fifa", "fc"],
    },
    {
      regex: /\bpeter\s+parker|spidey|spider-?man/i,
      tokens: ["spider", "spider-man"],
    },
    { regex: /\bhyrule|link\b/i, tokens: ["zelda"] },
    {
      regex: /\bpikachu|eevee|pokemon|pok[eé]mon|pakiman|pakimon/i,
      tokens: ["pokemon", "pokémon", "switch", "nintendo"],
    },
    {
      regex: /\bkratos|atreus|ragnarok|god\s+of\s+war/i,
      tokens: ["god of war"],
    },
    { regex: /\bmaster\s+chief|halo\b/i, tokens: ["halo"] },
    { regex: /\bvice\s+city|san\s+andreas|gta\b/i, tokens: ["gta"] },
    {
      regex:
        /\bsuper\s*hero|superhero|avengers?|marvel|dc\b|batman|superman|iron\s*man|captain\s+america|wolverine|thor\b/i,
      tokens: ["marvel", "avengers", "spider-man", "batman"],
    },
    {
      regex: /\bdiablo\b/i,
      tokens: ["diablo", "blizzard"],
    },
    {
      regex: /\bpokemon|pok[eé]mon|pakiman|pikachu|eevee\b/i,
      tokens: ["pokemon", "pokémon", "switch", "nintendo"],
    },
  ];

  // Franchise keyword filters to keep results on-topic
  const franchiseFilters: Array<{
    regex: RegExp;
    predicate: (name: string) => boolean;
  }> = [
    {
      regex: /spider-?man|spidey/i,
      predicate: (name) => /spider-?man/i.test(name),
    },
    {
      regex: /final\s+fantasy/i,
      predicate: (name) => /final\s+fantasy/i.test(name),
    },
    {
      regex: /diablo\b/i,
      predicate: (name) => /diablo\b/i.test(name),
    },
  ];

  const prioritizeByTokens = <
    T extends { name?: string | null; permalink?: string | null },
  >(
    products: T[],
    tokens: string[],
  ): T[] => {
    if (!tokens.length || !products.length) return products;
    const tokenSet = tokens.map((t) => t.toLowerCase());
    const scored = products.map((p) => {
      const name = (p.name || "").toLowerCase();
      const score = tokenSet.reduce(
        (acc, tok) => acc + (name.includes(tok) ? 1 : 0),
        0,
      );
      return { p, score };
    });
    const boosted = scored
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);
    const rest = scored.filter(({ score }) => score === 0);
    return [...boosted.map(({ p }) => p), ...rest.map(({ p }) => p)];
  };

  const dedupeWooProducts = <
    T extends { permalink?: string | null; name?: string | null },
  >(
    products: T[],
  ): T[] => {
    const seen = new Set<string>();
    return products.filter((p) => {
      const key = (p.permalink || p.name || "")?.toLowerCase();
      if (!key) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

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
      const { handlePerplexitySearch } = await import("./perplexitySearch");

      // Query rewriting: map user terms to actual product names
      // Sports: basketball → nba, football → fifa, skateboard → tony hawk
      // Hardware: gpu → graphic card, console → playstation, gamepad → controller
      let searchQuery = query;
      const lowerQuery = query.toLowerCase();

      // Live-sale / latest intent: bypass catalog and fetch fresh via Perplexity first
      const saleIntent =
        /\b(black\s*friday|cyber\s*monday|bf\s*deal|sale|deals?|promo|promotion|discount|latest|new\s+arrival)\b/i.test(
          lowerQuery,
        );
      if (saleIntent) {
        try {
          const perplexityQuery = `${query} site:tradezone.sg latest prices`;
          console.log(
            `[VectorSearch] Sale/latest intent detected; querying Perplexity: "${perplexityQuery}"`,
          );
          const perplexityResult =
            await handlePerplexitySearch(perplexityQuery);
          if (
            perplexityResult &&
            !perplexityResult.includes("No results found") &&
            !perplexityResult.includes("error")
          ) {
            return {
              text: perplexityResult,
              store: "product_catalog",
              matches: [],
              wooProducts: [],
            };
          }
        } catch (perplexityError) {
          console.error(
            "[VectorSearch] Perplexity sale/latest lookup failed:",
            perplexityError,
          );
        }
        const saleLink = "https://tradezone.sg/?s=sale";
        const bfLink = "https://tradezone.sg/?s=black+friday";
        const latestLink = "https://tradezone.sg/?s=new";
        return {
          text: `Current offers:\n- Black Friday/Cyber: ${bfLink}\n- All sales: ${saleLink}\n- New arrivals: ${latestLink}\nShare a product name/link and I'll fetch its latest price.`,
          store: "product_catalog",
          matches: [],
          wooProducts: [],
        };
      }

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
      } else if (
        /\b(handphone|phone|mobile|smartphone|android|iphone)\b/i.test(
          lowerQuery,
        )
      ) {
        // Anchor to phone category to avoid tablets
        searchQuery = "handphone phone mobile smartphone";
        console.log(
          `[VectorSearch] Phone query detected - forcing phone category`,
        );
      } else if (/\btablet\b/i.test(lowerQuery)) {
        // Map tablet to actual tablet products
        searchQuery = "tablet ipad galaxy tab";
        console.log(
          `[VectorSearch] Tablet detected, searching for: "${searchQuery}"`,
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
      } else if (
        /\b(headsets?|headphones?|earbuds?|earphones?|gaming\s*headset)\b/i.test(
          lowerQuery,
        )
      ) {
        searchQuery = "gaming headset";
        console.log(
          `[VectorSearch] Headset detected, searching for: "${searchQuery}"`,
        );
      } else if (
        /\b(mouse|mice|gaming\s*mouse|superlight|logitech|razer|steelseries|glorious|zowie|gpro|g pro)\b/i.test(
          lowerQuery,
        )
      ) {
        searchQuery = "gaming mouse superlight logitech razer steelseries";
        console.log(
          `[VectorSearch] Mouse query detected, searching for: "${searchQuery}"`,
        );
      } else if (
        /\b(camera|vlog|vlogging|youtube|action\s*cam|osmo|gopro)\b/i.test(
          lowerQuery,
        )
      ) {
        // Anchor camera queries to camera terms to avoid handheld/console matches
        if (!/osmo|gopro|insta\s*360/i.test(lowerQuery)) {
          searchQuery = "dji osmo camera";
        }
        console.log(
          `[VectorSearch] Camera query detected, searching for: "${searchQuery}"`,
        );
      } else if (
        /\b(hdd|hard\s*drive|harddrive|ssd|nvme|storage|m\.2|solid\s*state|ironwolf)\b/i.test(
          lowerQuery,
        )
      ) {
        searchQuery = "ssd hdd hard drive storage";
        console.log(
          `[VectorSearch] Storage query detected, searching for: "${searchQuery}"`,
        );
      } else if (/\bdiablo\b/i.test(lowerQuery)) {
        searchQuery = "diablo";
        console.log(
          `[VectorSearch] Diablo detected, searching for: "${searchQuery}"`,
        );
      }

      const cleanedQuery = cleanQueryForSearch(searchQuery);
      const entityTokens = ENTITY_HINT_MAP.reduce<string[]>((acc, entry) => {
        if (entry.regex.test(query)) acc.push(...entry.tokens);
        return acc;
      }, []);

      wooProducts = dedupeWooProducts(
        await searchWooProducts(cleanedQuery, wooLimit),
      );

      // If we have specific tokens (e.g., "unicorn"), require them in product names
      if (filteringTokens.length && wooProducts.length) {
        const strictFiltered = wooProducts.filter((product) => {
          const name = (product.name || "").toLowerCase();
          return filteringTokens.some((token) => name.includes(token));
        });
        if (strictFiltered.length) {
          wooProducts = strictFiltered;
        } else {
          wooProducts = [];
        }
      }

      if (
        !isTradeIntentContext &&
        filteringTokens.length &&
        !wooProducts.length
      ) {
        return {
          text: `Sorry, I couldn't find any products matching "${query}".`,
          store: "product_catalog",
          matches: [],
          wooProducts: [],
        };
      }

      // Phone-specific cleanup: remove tablet cross-bleed
      if (detectedCategory === "phone" && wooProducts.length > 0) {
        let phoneFiltered = wooProducts.filter((p) => {
          const cats = ((p as any).categories || [])
            .map((c: any) => c.name || "")
            .join(" ")
            .toLowerCase();
          const name = (p.name || "").toLowerCase();
          const isPhoneCat =
            /handphone|phone|mobile|smartphone|iphone|galaxy|pixel|oppo|xiaomi|huawei/.test(
              cats,
            ) ||
            /handphone|phone|mobile|smartphone|iphone|galaxy|pixel|oppo|xiaomi|huawei/.test(
              name,
            );
          const isTabletCat =
            /tablet|ipad/.test(cats) || /tablet|ipad/.test(name);
          return isPhoneCat && !isTabletCat;
        });

        if (phoneFiltered.length === 0) {
          phoneFiltered = dedupeWooProducts(
            await searchWooProducts("handphone phone mobile", wooLimit),
          ).filter((p) => {
            const cats = ((p as any).categories || [])
              .map((c: any) => c.name || "")
              .join(" ")
              .toLowerCase();
            const name = (p.name || "").toLowerCase();
            const isPhoneCat =
              /handphone|phone|mobile|smartphone|iphone|galaxy|pixel/.test(
                cats,
              ) ||
              /handphone|phone|mobile|smartphone|iphone|galaxy|pixel/.test(
                name,
              );
            const isTabletCat =
              /tablet|ipad/.test(cats) || /tablet|ipad/.test(name);
            return isPhoneCat && !isTabletCat;
          });
        }

        if (phoneFiltered.length > 0) {
          wooProducts = phoneFiltered;
          console.log(
            `[VectorSearch] Phone filter applied: kept ${phoneFiltered.length} items`,
          );
        } else {
          return {
            text: "Browse phones here: https://tradezone.sg/product-category/handphone-tablet/handphone/",
            store: resolvedStore.label,
            matches: [],
            wooProducts: [],
          };
        }
      }

      // Tablet-specific cleanup: remove phone/handphone cross-bleed
      if (detectedCategory === "tablet" && wooProducts.length > 0) {
        let tabletFiltered = wooProducts.filter((p) => {
          const cats = ((p as any).categories || [])
            .map((c: any) => c.name || "")
            .join(" ")
            .toLowerCase();
          const name = (p.name || "").toLowerCase();
          const isTabletCat =
            /tablet|ipad|tab\b/.test(cats) || /tablet|ipad|tab\b/.test(name);
          const isPhoneCat =
            /handphone|phone|mobile|smartphone/.test(cats) ||
            /handphone|phone|mobile|smartphone/.test(name);
          return isTabletCat && !isPhoneCat;
        });

        if (tabletFiltered.length === 0) {
          tabletFiltered = dedupeWooProducts(
            await searchWooProducts("tablet", wooLimit),
          ).filter((p) => {
            const cats = ((p as any).categories || [])
              .map((c: any) => c.name || "")
              .join(" ")
              .toLowerCase();
            const name = (p.name || "").toLowerCase();
            const isTabletCat =
              /tablet|ipad|tab\b/.test(cats) || /tablet|ipad|tab\b/.test(name);
            const isPhoneCat =
              /handphone|phone|mobile|smartphone/.test(cats) ||
              /handphone|phone|mobile|smartphone/.test(name);
            return isTabletCat && !isPhoneCat;
          });
        }

        if (tabletFiltered.length > 0) {
          wooProducts = tabletFiltered;
          console.log(
            `[VectorSearch] Tablet filter applied: kept ${tabletFiltered.length} items`,
          );
        } else {
          // Direct to tablet category page if nothing clean
          return {
            text: "Browse tablets here: https://tradezone.sg/product-category/handphone-tablet/tablet/",
            store: resolvedStore.label,
            matches: [],
            wooProducts: [],
          };
        }
      }

      // Apply franchise filters (e.g., Spider-Man, Final Fantasy, Diablo) to keep lists tight
      const franchiseMatch = franchiseFilters.find((f) => f.regex.test(query));
      if (franchiseMatch && wooProducts.length > 0) {
        const filtered = wooProducts.filter((p) =>
          franchiseMatch.predicate((p.name || "").toLowerCase()),
        );
        if (filtered.length > 0) {
          wooProducts = filtered;
          console.log(
            `[VectorSearch] Franchise filter applied (${franchiseMatch.regex}): kept ${filtered.length} items`,
          );
        }
      }

      // Platform intent filtering (PS5/PS4/Switch/Xbox/PC)
      const platformIntent = (() => {
        const q = lowerQuery;
        if (/ps5|playstation\s*5\b/i.test(q)) return "ps5";
        if (/ps4|playstation\s*4\b/i.test(q)) return "ps4";
        if (/switch|nintendo\s*switch/i.test(q)) return "switch";
        if (/\bxbox\b|series\s*[xs]\b|xbox\s*one/i.test(q)) return "xbox";
        if (/\bpc\b|steam|windows\b/i.test(q)) return "pc";
        return null;
      })();

      if (platformIntent && wooProducts.length > 0) {
        const platformFiltered = wooProducts.filter((p) => {
          const name = (p.name || "").toLowerCase();
          const cats = (p.categories || [])
            .map((c) => `${c.name || ""} ${c.slug || ""}`)
            .join(" ")
            .toLowerCase();
          switch (platformIntent) {
            case "ps5":
              // Allow PS5 games, including cross-platform titles (PS5/PS4, PS5/Xbox, etc.)
              return (
                /ps5|playstation\s*5/.test(name) ||
                /playstation\s*5|playstation-5|ps5/.test(cats)
              );
            case "ps4":
              // Allow PS4 games, including cross-platform titles (PS4/PS5, PS4/Switch, etc.)
              // Only exclude if it's ONLY for other platforms (has Xbox/Switch but NO PS4 mention)
              return (
                /ps4|playstation\s*4/.test(name) ||
                /playstation\s*4|playstation-4|ps4/.test(cats)
              );
            case "switch":
              // Allow Switch games, including cross-platform titles
              return (
                /switch|nintendo/.test(name) || /switch|nintendo/.test(cats)
              );
            case "xbox":
              // Allow Xbox games, including cross-platform titles
              return (
                /xbox|series\s*[xs]|xbox\s*one/.test(name) || /xbox/.test(cats)
              );
            case "pc":
              return /pc|windows|steam/.test(name) || /pc\s*related/.test(cats);
            default:
              return true;
          }
        });
        if (platformFiltered.length > 0) {
          wooProducts = platformFiltered;
          console.log(
            `[VectorSearch] Platform filter applied (${platformIntent}): kept ${platformFiltered.length} items`,
          );
        }
      }

      // Storage intent: prefer storage categories and drop non-storage if possible
      if (detectedCategory === "storage" && wooProducts.length > 0) {
        let storageFiltered = wooProducts.filter((p) => {
          const cats = (p as any).categories || [];
          const name = (p.name || "").toLowerCase();
          const isStorageCat = cats.some((c: string) =>
            /\b(storage|hdd|ssd|nvme|hard\s*drive|solid\s*state)\b/i.test(c),
          );
          const isLaptopCat = cats.some((c: string) =>
            /\b(laptop|notebook|desktop|pc)\b/i.test(c),
          );
          const isSSDName = /\b(ssd|nvme|m\.?2|solid\s*state)\b/i.test(name);
          // Exclude accessories, cases, games, and consoles that contain "storage" in name
          const isAccessory =
            /case|bag|controller|fan|game|mouse|pad|cover|housing|expansion card|drive.*console|portal|switch|playstation|xbox|ally/i.test(
              name,
            );
          const isLaptopPc = /laptop|notebook|pc\b|desktop|gaming pc/i.test(
            name,
          );
          // Require actual storage keywords in name, not just category match
          const hasStorageKeyword =
            /\b(ssd|nvme|m\.?2|solid\s*state|hard\s*drive|hdd)\b/i.test(name);
          return (
            (isStorageCat || isSSDName) &&
            hasStorageKeyword &&
            !isAccessory &&
            !isLaptopPc &&
            !isLaptopCat
          );
        });
        if (storageFiltered.length === 0) {
          // Try a direct storage search if category filter failed
          storageFiltered = dedupeWooProducts(
            await searchWooProducts("ssd nvme m.2 solid state drive", wooLimit),
          ).filter((p) => {
            const name = (p.name || "").toLowerCase();
            return /\b(ssd|nvme|m\.?2|solid\s*state)\b/i.test(name);
          });
        }
        if (storageFiltered.length > 0) {
          wooProducts = storageFiltered;
          console.log(
            `[VectorSearch] Storage intent: filtered to ${storageFiltered.length} storage items`,
          );
        } else {
          // Avoid returning unrelated products for storage queries
          wooProducts = [];
          console.log(
            "[VectorSearch] Storage intent: no storage items found after filtering",
          );
        }
      }

      // If the detected category is mouse, drop non-mouse categories and retry if empty
      if (
        detectedCategory === "mouse" &&
        wooProducts.length &&
        wooProducts.every(
          (p) =>
            !p.categories ||
            !p.categories.some((c) =>
              /\bmouse|mice|peripherals\/mouse\b/i.test(c),
            ),
        )
      ) {
        console.log(
          `[VectorSearch] Mouse query returned no mouse-category items, retrying mouse category directly`,
        );
        wooProducts = dedupeWooProducts(
          await searchWooProducts("mouse", wooLimit),
        );
      }

      // If no results and we detected entity hints, retry with boosted query tokens
      if (!wooProducts.length && entityTokens.length) {
        const boostedQuery = `${cleanedQuery} ${entityTokens.join(" ")}`.trim();
        console.log(
          `[VectorSearch] No results; retrying with entity hints: "${boostedQuery}"`,
        );
        wooProducts = dedupeWooProducts(
          await searchWooProducts(boostedQuery, wooLimit),
        );

        // If still nothing and we have entity hints, try Perplexity as a live lookup
        if (!wooProducts.length) {
          try {
            const liveQuery = `${boostedQuery} site:tradezone.sg`;
            console.log(
              `[VectorSearch] No results after entity retry; attempting Perplexity: "${liveQuery}"`,
            );
            const perplexityResult = await handlePerplexitySearch(liveQuery);
            if (
              perplexityResult &&
              !perplexityResult.includes("No results found") &&
              !perplexityResult.includes("error")
            ) {
              return {
                text: perplexityResult,
                store: label,
                matches: [],
                wooProducts: wooProducts.length > 0 ? wooProducts : undefined,
              };
            }
          } catch (perplexityError) {
            console.error(
              `[VectorSearch] Perplexity search failed after zero Woo results:`,
              perplexityError,
            );
          }
        }
      }

      // Entity hint re-rank: if query implies an entity (e.g., Ronaldo → FIFA), bump matching products
      if (entityTokens.length && wooProducts.length) {
        wooProducts = prioritizeByTokens(wooProducts, entityTokens);
        console.log(
          `[VectorSearch] Entity hint detected (${entityTokens.join(
            ", ",
          )}) - re-ranked ${wooProducts.length} products`,
        );
      }

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

      // Camera intent filter: remove handheld/console matches from camera queries
      const isCameraIntent =
        /\b(camera|vlog|youtube|action\s*cam|osmo|gopro|pocket\s*3)\b/i.test(
          lowerQuery,
        );
      if (isCameraIntent && wooProducts.length > 0) {
        const cameraKeep = [
          /camera/,
          /osmo/,
          /gopro/,
          /insta\s*360/,
          /pocket\s*3/,
        ];
        const cameraExclude = [
          /retroid/,
          /\bconsole\b/,
          /\bhandheld\b/,
          /neogeo/,
        ];
        const filtered = wooProducts.filter((product) => {
          const name = (product.name || "").toLowerCase();
          if (cameraExclude.some((re) => re.test(name))) return false;
          return cameraKeep.some((re) => re.test(name));
        });
        if (filtered.length > 0) {
          wooProducts = filtered;
          console.log(
            `[VectorSearch] Camera intent: filtered to ${filtered.length} camera products`,
          );
        }
      }

      // Headset intent filter: keep audio/headset products, drop PCs/GPUs/monitors/handhelds
      const isHeadsetIntent =
        /\b(headsets?|headphones?|earbuds?|earphones?|gaming\s*headset)\b/i.test(
          lowerQuery,
        );
      if (isHeadsetIntent && wooProducts.length > 0) {
        const headsetKeep = [
          /headset/,
          /headphone/,
          /earbud/,
          /earphone/,
          /pulse/,
          /inzone/,
          /cloud/,
          /steelseries/,
          /jabra/,
          /sony/,
          /bose/,
          /soundcore/,
          /logitech/,
          /corsair/,
          /astro/,
        ];
        const headsetExclude = [
          /\bgpu\b/,
          /\brtc\b/,
          /\bpc\b/,
          /\blaptop\b/,
          /\bdesktop\b/,
          /monitor/,
          /retroid/,
          /handheld/,
          /console/,
          /legion\s+go/,
          /gigabyte/,
          /zotac/,
        ];
        const filtered = wooProducts.filter((product) => {
          const name = (product.name || "").toLowerCase();
          if (headsetExclude.some((re) => re.test(name))) return false;
          return headsetKeep.some((re) => re.test(name));
        });
        if (filtered.length > 0) {
          wooProducts = filtered;
          console.log(
            `[VectorSearch] Headset intent: filtered to ${filtered.length} headset products`,
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

          const moreText = buildMoreResultsText(
            displayLimit,
            wooProducts.length,
            detectedCategory,
            query,
          );

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
        const skipVectorCategories = new Set([
          "phone",
          "tablet",
          "laptop",
          "storage",
        ]);
        const isCategoryBlocked =
          !!detectedCategory && skipVectorCategories.has(detectedCategory);
        const skipVectorEnrichment = isCategoryBlocked || isControllerQuery;

        console.log(
          `[VectorSearch] 🔍 Category check: detectedCategory="${detectedCategory}", isCategoryBlocked=${isCategoryBlocked}, skipVectorEnrichment=${skipVectorEnrichment}`,
        );

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

          const categoryNote = categoryLabel
            ? `- These ARE ${categoryLabel}s from our Handphone category - show ALL of them even if product names don't contain the word "${categoryLabel}"\n`
            : "";

          // Return DETERMINISTIC response - show products directly
          const intro =
            wooProducts.length > 0
              ? `Here's what we have (${wooProducts.length} products):\n\n`
              : `Sorry, I couldn't find any ${categoryLabel || "products"} matching "${query}".`;

          const deterministicResponse =
            wooProducts.length > 0
              ? `${summaryPrefix}${intro}${wooSection}`
              : intro;
          const responseText = `<<<DETERMINISTIC_START>>>${prependTradeSnippet(deterministicResponse)}<<<DETERMINISTIC_END>>>`;

          return {
            text: responseText,
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

          // Show more products if total is small (≤15), otherwise limit to 8
          const displayLimit =
            wooProducts.length <= 15 ? wooProducts.length : 8;
          const productsToShow = wooProducts.slice(0, displayLimit);

          const listText = productsToShow
            .map((product, idx) => {
              const price = formatSGDPrice(product.price_sgd);
              const url = product.permalink || `https://tradezone.sg`;
              // Include image for first product only to keep format consistent
              const imageStr =
                idx === 0 && product.image
                  ? `\n   ![${product.name}](${product.image})`
                  : "";
              return `${idx + 1}. **${product.name}** — ${price}\n   [View Product](${url})${imageStr}`;
            })
            .join("\n\n");

          const moreText = buildMoreResultsText(
            displayLimit,
            wooProducts.length,
            detectedCategory,
            query,
          );

          // DETERMINISTIC RESPONSE - show products directly to avoid losing sales
          const intro = `Here's what we have (${productsToShow.length} products):\n\n`;
          const deterministicResponse = intro + listText + moreText;
          const wrappedResponse = `<<<DETERMINISTIC_START>>>${prependTradeSnippet(deterministicResponse)}<<<DETERMINISTIC_END>>>`;

          return {
            text: wrappedResponse,
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
        // Show all products if total is small (≤15), otherwise limit to 8
        const displayLimit = wooProducts.length <= 15 ? wooProducts.length : 8;
        const productsToShow = wooProducts.slice(0, displayLimit);

        const listText = productsToShow
          .map((product, idx) => {
            const price = formatPriceWithBudget(
              product.price_sgd,
              fallbackBudgetContext,
            );
            const url = product.permalink || `https://tradezone.sg`;
            // Include image for first product only to keep format consistent
            const imageStr =
              idx === 0 && product.image
                ? `\n   ![${product.name}](${product.image})`
                : "";
            return `${idx + 1}. **${product.name}** — ${price}\n   [View Product](${url})${imageStr}`;
          })
          .join("\n\n");

        const moreText = buildMoreResultsText(
          displayLimit,
          wooProducts.length,
          detectedCategory,
          query,
        );

        const budgetCategoryLabel = buildCategoryLabel(detectedCategory);
        const budgetSummaryLine = buildBudgetSummaryLine(
          fallbackBudgetContext,
          budgetCategoryLabel,
        );
        const summaryPrefix = budgetSummaryLine
          ? `${budgetSummaryLine}\n\n`
          : "";

        // DETERMINISTIC RESPONSE - show products directly to avoid losing sales
        const intro = `Here's what we have (${productsToShow.length} products):\n\n`;
        const deterministicResponse =
          summaryPrefix + intro + listText + moreText;
        const responseText = `<<<DETERMINISTIC_START>>>${prependTradeSnippet(deterministicResponse)}<<<DETERMINISTIC_END>>>`;

        return {
          text: responseText,
          store: "product_catalog",
          matches: [],
          wooProducts: wooProducts.length > 0 ? wooProducts : undefined,
        };
      } else {
        // For specific categories (phone/tablet/laptop), don't fall back to vector - prevent hallucination
        const detectedCategory = extractProductCategory(query);
        const blockVectorFallback = [
          "phone",
          "tablet",
          "laptop",
          "storage",
        ].includes(detectedCategory || "");

        if (blockVectorFallback) {
          console.log(
            `[VectorSearch] ❌ No WooCommerce ${detectedCategory} found - directing to category page (no vector fallback)`,
          );

          // Category page links
          const categoryLinks: Record<string, string> = {
            laptop: "https://tradezone.sg/product-category/laptop/",
            phone:
              "https://tradezone.sg/product-category/handphone-tablet/handphone/",
            tablet:
              "https://tradezone.sg/product-category/handphone-tablet/tablet/",
            storage:
              "https://tradezone.sg/product-category/pc-related/pc-parts/storage/",
          };

          const categoryLink = categoryLinks[detectedCategory || ""];

          let categoryText = "";
          if (categoryLink) {
            // Found category - direct user to browse
            categoryText = `I don't have exact matches for "${query}". Browse all ${detectedCategory}s: [View ${detectedCategory}s](${categoryLink})`;
          } else {
            // No category - ask what they're looking for
            categoryText = `I don't have "${query}" in my records. What are you looking for? Gaming consoles, games, laptops, phones, or accessories?`;
          }

          return {
            text: categoryText,
            store: "product_catalog",
            matches: [],
            wooProducts: [],
          };
        }

        console.log(
          `[VectorSearch] ❌ No WooCommerce matches - continuing to vector search for enrichment`,
        );
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
                  const wooResults = dedupeWooProducts(
                    await searchWooProducts(cleanedFallbackQuery, 5),
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
      {
        regex: /basketball|nba|2k|curry|jordan|lebron|durant/i,
        tokens: ["nba", "2k", "basketball"],
      },
      {
        regex: /football|soccer|fifa|fc ?24|ea sports fc|messi|ronaldo/i,
        tokens: ["fifa", "fc", "football"],
      },
      {
        regex: /wrestling|wwe|wwf|undertaker|cena/i,
        tokens: ["wwe", "wrestling", "2k"],
      },
      {
        regex: /skateboard|skate|tony hawk/i,
        tokens: ["skate", "tony hawk", "skateboard"],
      },
      {
        regex:
          /\bcar\s+games?|\bracing\s+games?|\bgran turismo|forza|need\s+for\s+speed|nfs|burnout|mario\s+kart/i,
        tokens: ["racing", "car", "turismo", "forza", "kart", "speed"],
      },
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

    // Smart sports filter: Trust WooCommerce/Graphiti catalog as source of truth
    // If products found → show them (they're video games we sell like NBA 2K, FIFA, Madden)
    // If NO products found AND sports keyword → show helpful redirect message
    if (sportFilters.length > 0 && wooProducts.length === 0) {
      // No products found for sports query - offer helpful redirect
      const sportType = lowerQuery.match(
        /basketball|nba(?!\s*2k)|curry|jordan/i,
      )
        ? "basketball"
        : lowerQuery.match(/skateboard|skate|tony hawk/i)
          ? "skateboarding"
          : lowerQuery.match(/football|soccer|messi|ronaldo/i)
            ? "football/soccer"
            : lowerQuery.match(/wrestling|wwe|cena/i)
              ? "wrestling"
              : lowerQuery.match(
                    /\bcar\s+games?|\bracing\s+games?|gran turismo|forza|need\s+for\s+speed/i,
                  )
                ? "racing/car"
                : "sports";

      finalText = `[SPORTS_FILTER_APPLIED] We don't currently stock ${sportType} games, but we focus on other popular titles! Check out our console games section or let me know what else you're looking for.`;

      return {
        text: finalText,
        store: label,
        matches: [],
        wooProducts: undefined,
      };
    }

    // Products found OR not a sports query - show results normally
    if (wooProducts.length > 0) {
      console.log(
        `[VectorSearch] Step 4: Combining WooCommerce products with vector enrichment`,
      );
      // Show all products if total is small (≤15) or user wants full list, otherwise limit to 8
      const displayLimit = Math.min(
        wooProducts.length,
        wantsFullList || wooProducts.length <= 15 ? wooProducts.length : 8,
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
