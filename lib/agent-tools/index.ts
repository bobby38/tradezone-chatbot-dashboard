import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  findCatalogMatches,
  getCatalogModelById,
  type CatalogMatch,
  type CatalogConditionSummary,
  type PriceRange,
} from "@/lib/chatkit/productCatalog";

// Support both local files and remote URLs for WooCommerce product catalog
const WOO_PRODUCTS_PATH =
  process.env.WOOCOMMERCE_PRODUCT_JSON_PATH ||
  path.join(process.cwd(), "public", "tradezone-WooCommerce-Products.json");

const PRICE_GRID_SOURCE = "products_master.json";
const REVIEW_TABLE = "agent_review_queue";
const ORDER_TABLE = "agent_orders";
const INSPECTION_TABLE = "agent_inspections";
export const CATEGORY_SLUG_MAP: Record<string, string[]> = {
  laptop: ["laptop"],
  phone: ["handphone", "smartphone", "phones"],
  tablet: ["tablet"],
  chair: ["chair"],
  cpu_cooler: ["cpu-cooler"],
  storage: ["storage"],
};

export const DIRECT_CATEGORY_KEYS = [
  "phone",
  "tablet",
  "chair",
  "cpu_cooler",
] as const;

export const DIRECT_CATEGORY_SET = new Set<string>(DIRECT_CATEGORY_KEYS);

let wooProductsCache: {
  loadedAt: number;
  map: Map<number, WooProduct>;
} | null = null;

interface WooProduct {
  id: number;
  name: string;
  permalink: string;
  price: string;
  regular_price?: string;
  stock_status?: string;
  stock_quantity?: number | null;
  images?: Array<{ id: number; src: string; alt?: string }>;
  categories?: Array<{ id: number; name: string; slug: string }>;
}

export interface WooProductSearchResult {
  productId: number;
  name: string;
  permalink?: string;
  price_sgd: number | null;
  stock_status?: string;
  image?: string;
}

export async function getWooProductsByCategory(
  slugs: string[],
  limit = 12,
  sort: "asc" | "desc" = "asc",
): Promise<WooProductSearchResult[]> {
  if (!slugs.length) {
    return [];
  }
  const products = Array.from((await loadWooProducts()).values());
  const filtered = products.filter((product) =>
    (product.categories || []).some((cat) => slugs.includes(cat.slug)),
  );

  const mapped = filtered
    .map((product) => ({
      productId: product.id,
      name: product.name,
      permalink: product.permalink,
      price_sgd: parseMoney(product.price),
      stock_status: product.stock_status,
      image: product.images?.[0]?.src,
    }))
    .filter((entry) => entry.price_sgd != null)
    .sort((a, b) => {
      if (sort === "asc") {
        return (a.price_sgd ?? Infinity) - (b.price_sgd ?? Infinity);
      }
      return (b.price_sgd ?? -Infinity) - (a.price_sgd ?? -Infinity);
    });

  return mapped.slice(0, limit);
}

export interface NormalizeProductResult {
  query: string;
  candidates: Array<{
    productId: string;
    familyId: string;
    name: string;
    permalink?: string;
    priceRange?: PriceRange | null;
    flagshipCondition?: string;
    confidence: number;
  }>;
}

export interface PriceLookupInput {
  productId: string;
  condition?: string;
  priceType?: "retail" | "trade_in";
}

export interface PriceLookupResult {
  productId: string;
  condition: string;
  priceType: "retail" | "trade_in";
  currency: "SGD";
  value_sgd: number | null;
  min_sgd: number | null;
  max_sgd: number | null;
  source: string;
  confidence: number;
}

export interface TopUpResult {
  top_up_sgd: number;
  steps: string[];
}

export interface InventoryCheckResult {
  productId: string;
  name: string;
  in_stock: boolean;
  stock_count: number | null;
  location: string;
  price_sgd: number | null;
  permalink?: string;
}

export interface OrderPayload {
  sessionId?: string;
  userId?: string;
  productId: string;
  paymentMethod: string;
  options?: Record<string, unknown> | null;
}

export interface InspectionPayload {
  sessionId?: string;
  userId?: string;
  storeId?: string;
  timeslot: string;
  notes?: string;
}

export interface HumanReviewPayload {
  sessionId: string;
  reason: string;
  payload?: Record<string, unknown>;
}

export interface OcrExtractInput {
  imageUrl: string;
  promptHint?: string;
}

export interface OcrExtractResult {
  detected_model: string | null;
  serial_hint: string | null;
  photoscore: number;
  raw_response?: string;
}

function getSupabaseServerClient(): SupabaseClient | null {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return null;
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
      },
    },
  );
}

function parseMoney(value?: string | null): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function isInCategory(product: WooProduct, category: string): boolean {
  const slugs = CATEGORY_SLUG_MAP[category];
  if (!slugs || !product.categories || !product.categories.length) {
    return false;
  }
  return product.categories.some((cat) => slugs.includes(cat.slug));
}

async function loadWooProducts(): Promise<Map<number, WooProduct>> {
  // Cache for 5 minutes (or force reload if FORCE_RELOAD_WOO env is set)
  const forceReload = process.env.FORCE_RELOAD_WOO === "true";
  if (
    !forceReload &&
    wooProductsCache &&
    Date.now() - wooProductsCache.loadedAt < 5 * 60 * 1000
  ) {
    return wooProductsCache.map;
  }
  try {
    let raw: string;

    // Support both local files and remote URLs
    if (
      WOO_PRODUCTS_PATH.startsWith("http://") ||
      WOO_PRODUCTS_PATH.startsWith("https://")
    ) {
      console.log(
        "[agent-tools] Fetching WooCommerce products from URL:",
        WOO_PRODUCTS_PATH,
      );
      const response = await fetch(WOO_PRODUCTS_PATH);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch WooCommerce products: ${response.status} ${response.statusText}`,
        );
      }
      raw = await response.text();
    } else {
      console.log(
        "[agent-tools] Loading WooCommerce products from local file:",
        WOO_PRODUCTS_PATH,
      );
      raw = await fs.readFile(WOO_PRODUCTS_PATH, "utf8");
    }

    const parsed = JSON.parse(raw) as WooProduct[];

    // 🔴 FILTER OUT TEST PRODUCTS ONLY (price = $1)
    const filtered = parsed.filter((product) => {
      // Remove test products with $1 price
      if (product.name === "Test" && product.price === "1") {
        return false;
      }
      return true;
    });

    const map = new Map<number, WooProduct>();
    filtered.forEach((product) => map.set(product.id, product));
    wooProductsCache = { map, loadedAt: Date.now() };

    const removedCount = parsed.length - filtered.length;
    if (removedCount > 0) {
      console.log(
        `[agent-tools] 🔴 Filtered out ${removedCount} test products`,
      );
    }
    console.log(
      `[agent-tools] ✅ Loaded ${map.size} WooCommerce products from ${WOO_PRODUCTS_PATH.startsWith("http") ? "URL" : "local file"}`,
    );
    return map;
  } catch (error) {
    console.warn("[agent-tools] Failed to load WooCommerce snapshot", error);
    wooProductsCache = { map: new Map(), loadedAt: Date.now() };
    return wooProductsCache.map;
  }
}

function scoreCandidate(match: CatalogMatch, index: number): number {
  const base = 1 - index * 0.15;
  return Math.max(0, Math.min(1, base));
}

export async function normalizeProduct(
  query: string,
  limit = 5,
): Promise<NormalizeProductResult> {
  const matches = await findCatalogMatches(query, limit);
  const candidates = matches.map((match, idx) => ({
    productId: match.modelId,
    familyId: match.familyId,
    name: match.name,
    permalink: match.permalink,
    priceRange: match.priceRange,
    flagshipCondition: match.flagshipCondition?.label,
    confidence: scoreCandidate(match, idx),
  }));
  return { query, candidates };
}

function selectCondition(
  model: CatalogMatch | null,
  condition?: string,
): CatalogConditionSummary | null {
  if (!model) return null;
  if (condition) {
    const normalized = condition.toLowerCase();
    const match = model.conditions.find(
      (summary) => summary.condition.toLowerCase() === normalized,
    );
    if (match) return match;
  }
  return model.flagshipCondition || model.conditions[0] || null;
}

export async function searchWooProducts(
  query: string,
  limit = 5,
): Promise<WooProductSearchResult[]> {
  console.log(`[searchWooProducts] START - query: "${query}", limit: ${limit}`);
  if (!query) return [];
  const normalized = query.toLowerCase();
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];

  // Detect product family in query (same logic as catalog search)
  const familyKeywords = [
    {
      pattern: /\b(ps5|playstation\s*5|playstation5)\b/i,
      keywords: ["ps5", "playstation 5", "playstation5"],
    },
    {
      pattern: /\b(ps4|playstation\s*4|playstation4)\b/i,
      keywords: ["ps4", "playstation 4", "playstation4"],
    },
    {
      pattern: /\b(xbox\s*series|xsx|xss|series\s*x|series\s*s)\b/i,
      keywords: ["xbox series", "series x", "series s"],
    },
    {
      pattern: /\b(switch|nintendo\s*switch)\b/i,
      keywords: ["switch", "nintendo"],
    },
    {
      pattern: /\b(steam\s*deck|rog\s*ally|ally|legion|claw)\b/i,
      keywords: ["steam deck", "rog ally", "legion", "claw"],
    },
    { pattern: /\b(quest|psvr|vr)\b/i, keywords: ["quest", "psvr", "vr"] },
    // IMPORTANT: Check tablet BEFORE phone pattern (galaxy tab must not match phone category)
    {
      pattern: /\b(tablets?|ipads?|galaxy\s*tab)\b/i,
      keywords: ["tablet", "ipad", "galaxy tab"],
      category: "tablet",
    },
    // Phone/tablet patterns - match generic + specific brands (with plurals)
    {
      pattern:
        /\b(handphones?|phones?|mobiles?|smartphones?|iphone|samsung\s*galaxy|galaxy\s*(z|s|a|note)|pixel|oppo)\b/i,
      keywords: [
        "handphone",
        "phone",
        "mobile",
        "smartphone",
        "iphone",
        "galaxy",
        "pixel",
        "oppo",
      ],
      category: "phone",
    },
    {
      pattern: /\b(360\s+camera|camera|gopro|insta360|osmo|pocket\s*3)\b/i,
      keywords: ["camera", "gopro", "insta", "osmo", "pocket"],
      category: "camera",
    },
    {
      pattern: /\b(laptops?|notebooks?|ultrabooks?|gaming\s*laptops?)\b/i,
      keywords: [],
      category: "laptop",
    },
    {
      pattern:
        /\b(gaming\s*chairs?|chairs?|seat\s*zone|seatzone|ergonomic\s*chairs?)\b/i,
      keywords: ["chair", "gaming chair", "seatzone"],
      category: "chair",
    },
    {
      pattern:
        /\b(cpu\s*coolers?|coolers?|cpu\s*fans?|aio\s*(coolers?|liquid)|liquid\s*coolers?|heatsinks?|radiators?)\b/i,
      keywords: ["cpu cooler", "cooler", "aio", "liquid cooler", "heatsink"],
      category: "cpu_cooler",
    },
    {
      pattern:
        /\b(hdd|hard\s*drive|harddrive|ssd|nvme|storage|m\.2|solid\s*state)\b/i,
      keywords: ["ssd", "nvme", "m.2", "hard drive", "storage"],
      category: "storage",
    },
  ];

  let familyFilter: string[] | null = null;
  let categoryFilter: string | null = null;
  for (const { pattern, keywords, category } of familyKeywords) {
    if (pattern.test(query)) {
      familyFilter = keywords;
      categoryFilter = category || null;
      console.log(
        `[searchWooProducts] Detected category: ${categoryFilter || "gaming"}, filter:`,
        keywords,
      );
      break;
    }
  }

  if (categoryFilter && DIRECT_CATEGORY_SET.has(categoryFilter)) {
    const slugList = CATEGORY_SLUG_MAP[categoryFilter] || [];
    if (slugList.length) {
      const deterministicResults = await getWooProductsByCategory(
        slugList,
        limit,
        "asc",
      );
      if (deterministicResults.length) {
        console.log(
          `[searchWooProducts] Direct ${categoryFilter} category hit (${deterministicResults.length} products)`,
        );
        return deterministicResults;
      }
      console.log(
        `[searchWooProducts] Direct ${categoryFilter} category hit returned 0 products, falling back to scored search`,
      );
    }
  }

  console.log(`[searchWooProducts] Loading WooCommerce products...`);
  const products = Array.from((await loadWooProducts()).values());
  console.log(
    `[searchWooProducts] Loaded ${products.length} products, starting scoring...`,
  );

  // Debug: Check if we have any products with "handphone" category
  if (categoryFilter === "phone") {
    const phoneProducts = products.filter((p) =>
      (p.categories || []).some((c) => /handphone/i.test(c.name)),
    );
    console.log(
      `[searchWooProducts] DEBUG: Found ${phoneProducts.length} products in Handphone category`,
    );
    if (phoneProducts.length > 0) {
      console.log(`[searchWooProducts] DEBUG: Sample phone product:`, {
        name: phoneProducts[0].name,
        categories: phoneProducts[0].categories.map((c) => c.name),
      });
    }
  }

  const scored = products
    .map((product) => {
      const name = (product.name || "").toLowerCase();
      let score = 0;

      // FILTER: When user asks for "game", exclude trading cards/posters/non-games
      if (/\b(game|games)\b/i.test(query)) {
        const isNonGame =
          /\b(trading\s*card|poster|figure|plush|toy|keychain|sticker|art\s*book)\b/i.test(
            name,
          );
        if (isNonGame) {
          return { product, score: 0 }; // Exclude non-game items
        }
      }

      // Apply category filter for phones/tablets (use WooCommerce categories)
      if (categoryFilter === "phone" || categoryFilter === "tablet") {
        // Check if product is in the correct WooCommerce category
        const productCategories = (product.categories || [])
          .map((c) => c.name.toLowerCase())
          .join(" ");

        // For phone searches, require "Handphone" category AND exclude tablet-only products
        if (categoryFilter === "phone") {
          const hasHandphoneCategory = /handphone/i.test(productCategories);
          const hasOnlyTabletCategory =
            /\btablet\b/i.test(productCategories) &&
            !/handphone/i.test(productCategories);

          // Must have "Handphone" category AND not be tablet-only
          if (!hasHandphoneCategory || hasOnlyTabletCategory) {
            return { product, score: 0 };
          }

          // Also exclude products with "iPad" or "Tab" in the name when searching for phones
          const isTabletProduct = /\b(ipad|galaxy\s*tab)\b/i.test(name);
          if (isTabletProduct) {
            return { product, score: 0 };
          }
        }

        // For tablet searches, require "Tablet" category
        if (categoryFilter === "tablet" && !/tablet/i.test(productCategories)) {
          return { product, score: 0 };
        }

        // CRITICAL: Exclude accessories (chargers, cases, screen protectors, etc.)
        const commonAccessoryKeywords = [
          "charger",
          "charging",
          "cable",
          "adapter",
          "dock",
          "cyberdock",
          "case",
          "cover",
          "protector",
          "screen protector",
          "tempered glass",
          "stand",
          "holder",
          "mount",
          "strap",
          "band",
          "warranty",
          "extension",
          "filter",
          "lens",
          // Exclude audio/wearables when user asked for phones/tablets
          "headphone",
          "headphones",
          "earbud",
          "earbuds",
          "earpod",
          "earpods",
          "earphone",
          "earphones",
          "buds",
          "airpods",
          "sony wh-",
        ];

        // Additional exclusions ONLY for phone category (not tablet)
        const phoneOnlyExclusions =
          categoryFilter === "phone" ? ["tablet", "tab ", "galaxy tab"] : [];

        const allAccessoryKeywords = [
          ...commonAccessoryKeywords,
          ...phoneOnlyExclusions,
        ];
        const isAccessory = allAccessoryKeywords.some((keyword) =>
          name.includes(keyword),
        );
        if (isAccessory) {
          return { product, score: 0 }; // Exclude accessories from phone/tablet results
        }

        // Bonus points for phone/tablet category match
        score += 100;

        // CRITICAL: Prioritize exact brand matches (oppo, pixel, samsung, etc.)
        // If query has specific brand, boost products with that brand
        const brandTokens = tokens.filter((t) =>
          ["oppo", "pixel", "samsung", "galaxy", "iphone"].includes(t),
        );
        brandTokens.forEach((brand) => {
          if (name.includes(brand)) {
            score += 500; // Heavy bonus for matching the requested brand
          }
        });
      } else if (categoryFilter === "camera") {
        const matchesCategory = familyFilter!.some((keyword) =>
          name.includes(keyword),
        );
        if (!matchesCategory) {
          return { product, score: 0 };
        }

        const userAskingAccessory =
          /\b(filter|case|warranty|bag|mount|tripod|strap|battery|accessor(y|ies))\b/i.test(
            normalized,
          );
        const accessoryKeywords = [
          "filter",
          "warranty",
          "extension",
          "case",
          "pouch",
          "bag",
          "strap",
          "mount",
          "tripod",
          "adapter",
          "cable",
          "charger",
        ];
        const isAccessory = accessoryKeywords.some((keyword) =>
          name.includes(keyword),
        );
        if (isAccessory && !userAskingAccessory) {
          return { product, score: 0 };
        }

        score += 100;
      } else if (categoryFilter === "storage") {
        const productCategories = (product.categories || [])
          .map((c) => c.name.toLowerCase())
          .join(" ");
        const hasStorageKeyword =
          /\b(ssd|nvme|m\.?2|solid\s*state|hard\s*drive|hdd)\b/i.test(name);
        if (!hasStorageKeyword) {
          return { product, score: 0 };
        }
        const isAccessory =
          /case|bag|cover|housing|controller|mouse|pad|fan|game|console|playstation|xbox|switch|portal|drive\b(?!\s*ssd|\s*nvme|\s*hard)/i.test(
            name,
          );
        const isLaptopPc = /laptop|notebook|pc\b|desktop|gaming pc/i.test(name);
        const isLaptopCategory = /\b(laptop|notebook|desktop|pc)\b/i.test(
          productCategories,
        );
        if (isAccessory || isLaptopPc || isLaptopCategory) {
          return { product, score: 0 };
        }
        score += 100;
      } else if (categoryFilter === "laptop") {
        // Laptops are identified via Woo categories since product names may omit "laptop"
        const inLaptopCategory = isInCategory(product, "laptop");
        console.log(
          `[searchWooProducts] 🔍 Checking laptop category for "${product.name}": inCategory=${inLaptopCategory}, categories=${JSON.stringify(product.categories?.map((c) => c.slug))}`,
        );
        if (!inLaptopCategory) {
          return { product, score: 0 };
        }
        score += 100;
      }
      // Apply family filter if detected (gaming products)
      else if (familyFilter && tokens.length > 1) {
        const matchesFamily = familyFilter.some((keyword) =>
          name.includes(keyword),
        );
        if (!matchesFamily) {
          return { product, score: 0 }; // Filter out products from other families
        }
      }

      // Score based on token matching
      tokens.forEach((token) => {
        if (name.includes(token)) {
          score += token.length;
        }
      });
      return { product, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  console.log(
    `[searchWooProducts] Scored ${scored.length} products after filtering`,
  );
  if (categoryFilter) {
    console.log(
      `[searchWooProducts] 📋 Category filter "${categoryFilter}" results:`,
      scored.map((s) => s.product.name),
    );
  }

  let results = scored.map(({ product }) => ({
    productId: product.id,
    name: product.name,
    permalink: product.permalink,
    price_sgd: parseMoney(product.price),
    stock_status: product.stock_status,
    image: product.images?.[0]?.src, // Include first image
  }));

  if (
    results.length === 0 &&
    categoryFilter &&
    CATEGORY_SLUG_MAP[categoryFilter]
  ) {
    const fallbackProducts = products
      .filter((product) => isInCategory(product, categoryFilter))
      .sort((a, b) => {
        const priceA = parseMoney(a.price) ?? Number.POSITIVE_INFINITY;
        const priceB = parseMoney(b.price) ?? Number.POSITIVE_INFINITY;
        return priceA - priceB;
      })
      .slice(0, limit);

    if (fallbackProducts.length) {
      results = fallbackProducts.map((product) => ({
        productId: product.id,
        name: product.name,
        permalink: product.permalink,
        price_sgd: parseMoney(product.price),
        stock_status: product.stock_status,
        image: product.images?.[0]?.src,
      }));
    }
  }

  // Debug logging to check if permalinks exist
  if (results.length > 0) {
    console.log(
      "[searchWooProducts] Sample result:",
      JSON.stringify(results[0], null, 2),
    );
  }

  return results;
}

export async function priceLookup(
  input: PriceLookupInput,
): Promise<PriceLookupResult> {
  const { productId, condition, priceType = "trade_in" } = input;
  const model = await getCatalogModelById(productId);
  if (!model) {
    return {
      productId,
      condition: condition || "brand_new",
      priceType,
      currency: "SGD",
      value_sgd: null,
      min_sgd: null,
      max_sgd: null,
      source: PRICE_GRID_SOURCE,
      confidence: 0.2,
    };
  }

  const catalogMatch: CatalogMatch = {
    modelId: model.modelId,
    familyId: model.familyId,
    familyTitle: model.familyTitle,
    name: model.title,
    permalink: model.permalink,
    price: undefined,
    priceRange: model.priceRange,
    familyRange: model.familyRange,
    conditions: model.conditions,
    flagshipCondition: model.conditions[0] || null,
    warnings: model.warnings,
  };

  const summary = selectCondition(catalogMatch, condition);
  const resolvedCondition = summary?.condition || condition || "brand_new";

  let value: number | null = null;
  let min: number | null = null;
  let max: number | null = null;
  if (priceType === "retail") {
    value = summary?.basePrice ?? null;
  } else if (summary?.tradeIn) {
    min = summary.tradeIn.min ?? summary.tradeIn.max ?? null;
    max = summary.tradeIn.max ?? summary.tradeIn.min ?? null;
    if (min !== null && max !== null) {
      value = (min + max) / 2;
    } else {
      value = min ?? max;
    }
  }

  const confidence = value === null ? 0.4 : 0.9;

  return {
    productId,
    condition: resolvedCondition,
    priceType,
    currency: "SGD",
    value_sgd: value,
    min_sgd: min,
    max_sgd: max,
    source: PRICE_GRID_SOURCE,
    confidence,
  };
}

export function calculateTopUp(
  targetPrice: number,
  tradeInValue: number,
  usedDiscount = 0,
): TopUpResult {
  const normalizedTarget = Math.round(targetPrice);
  const normalizedTrade = Math.round(tradeInValue);
  const normalizedDiscount = Math.round(usedDiscount || 0);
  const raw = normalizedTarget - normalizedTrade - normalizedDiscount;
  const topUp = Math.max(0, raw);
  const steps = [
    `target_price_sgd (${normalizedTarget}) minus trade_in_value_sgd (${normalizedTrade}) minus used_device_discount_sgd (${normalizedDiscount}) equals ${topUp}`,
  ];
  return { top_up_sgd: topUp, steps };
}

export async function inventoryCheck(
  productId: string,
): Promise<InventoryCheckResult> {
  const numericId = Number(productId);
  const [model, products] = await Promise.all([
    getCatalogModelById(productId),
    loadWooProducts(),
  ]);
  const woo = products.get(Number.isNaN(numericId) ? -1 : numericId);
  const price = woo?.price ? Number(woo.price) : model?.priceRange?.max || null;
  const stockStatus =
    woo?.stock_status ||
    (model?.conditions.some((c) => c.soldOut) ? "outofstock" : "instock");
  return {
    productId,
    name: model?.title || woo?.name || "Unknown product",
    in_stock: stockStatus === "instock",
    stock_count: woo?.stock_quantity ?? null,
    location: "TradeZone Warehouse",
    price_sgd: price || null,
    permalink: model?.permalink || woo?.permalink,
  };
}

export async function createOrder(
  payload: OrderPayload,
): Promise<{ order_id: string; status: string }> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase not configured for createOrder");
  }
  const insertPayload = {
    session_id: payload.sessionId ?? null,
    user_id: payload.userId ?? null,
    product_id: payload.productId,
    payment_method: payload.paymentMethod,
    options: payload.options ?? null,
    status: "queued",
  };
  const { data, error } = await supabase
    .from(ORDER_TABLE)
    .insert(insertPayload)
    .select()
    .single();
  if (error) {
    throw error;
  }
  return { order_id: data.id, status: data.status };
}

export async function scheduleInspection(
  payload: InspectionPayload,
): Promise<{ booking_id: string; confirmation: string }> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase not configured for scheduleInspection");
  }
  const insertPayload = {
    session_id: payload.sessionId ?? null,
    user_id: payload.userId ?? null,
    store_id: payload.storeId ?? "hougang",
    timeslot: payload.timeslot,
    notes: payload.notes ?? null,
  };
  const { data, error } = await supabase
    .from(INSPECTION_TABLE)
    .insert(insertPayload)
    .select()
    .single();
  if (error) {
    throw error;
  }
  const confirmation = `Inspection booked for ${data.timeslot} at store ${data.store_id}`;
  return { booking_id: data.id, confirmation };
}

export async function enqueueHumanReview(
  payload: HumanReviewPayload,
): Promise<{ ticket_id: string }> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase not configured for enqueueHumanReview");
  }
  const insertPayload = {
    session_id: payload.sessionId,
    reason: payload.reason,
    payload: payload.payload ?? null,
    status: "open",
  };
  const { data, error } = await supabase
    .from(REVIEW_TABLE)
    .insert(insertPayload)
    .select()
    .single();
  if (error) {
    throw error;
  }
  return { ticket_id: data.id };
}

export async function ocrAndExtract(
  input: OcrExtractInput,
): Promise<OcrExtractResult> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      detected_model: null,
      serial_hint: null,
      photoscore: 0.4,
      raw_response: "OpenAI API key missing",
    };
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt =
    input.promptHint ||
    "Identify the consumer electronics model and any serial hints from this photo. Respond as JSON with keys detected_model, serial_hint, clarity_score (0-1).";
  const response = await openai.responses.create({
    model: "gpt-4o-mini",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: input.imageUrl },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "photo_extract",
        schema: {
          type: "object",
          properties: {
            detected_model: { type: ["string", "null"] },
            serial_hint: { type: ["string", "null"] },
            clarity_score: { type: "number", minimum: 0, maximum: 1 },
          },
          required: ["detected_model", "serial_hint", "clarity_score"],
          additionalProperties: false,
        },
      },
    },
  });
  const text = response.output?.[0]?.content?.[0]?.text;
  if (!text) {
    return {
      detected_model: null,
      serial_hint: null,
      photoscore: 0.4,
      raw_response: JSON.stringify(response),
    };
  }
  try {
    const parsed = JSON.parse(text);
    return {
      detected_model: parsed.detected_model ?? null,
      serial_hint: parsed.serial_hint ?? null,
      photoscore:
        typeof parsed.clarity_score === "number" ? parsed.clarity_score : 0.5,
      raw_response: text,
    };
  } catch (error) {
    console.warn("[agent-tools] Failed to parse OCR response", error);
    return {
      detected_model: null,
      serial_hint: null,
      photoscore: 0.4,
      raw_response: text,
    };
  }
}
