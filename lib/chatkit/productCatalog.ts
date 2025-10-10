import fs from "node:fs";
import path from "node:path";

interface CatalogProduct {
  id: number;
  name?: string;
  permalink?: string;
  price?: string;
  regular_price?: string;
  sale_price?: string;
  stock_status?: string;
  images?: Array<{ src?: string }>;
  categories?: Array<{ name?: string }>;
  tags?: Array<{ name?: string }>;
  short_description?: string;
  description?: string;
}

let catalogCache: CatalogProduct[] | null = null;
let lastLoadedAt = 0;

const CACHE_TTL_MS = 1000 * 60 * 5; // 5 minutes

function resolveCatalogPath(): string {
  if (process.env.WOOCOMMERCE_PRODUCT_JSON_PATH) {
    return process.env.WOOCOMMERCE_PRODUCT_JSON_PATH;
  }

  return path.resolve(
    process.cwd(),
    "../tradezone_md_pipeline/product-json/tradezone-WooCommerce-Products.json",
  );
}

function loadCatalog(): CatalogProduct[] {
  const now = Date.now();
  if (catalogCache && now - lastLoadedAt < CACHE_TTL_MS) {
    return catalogCache;
  }

  const filePath = resolveCatalogPath();

  try {
    const fileContents = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(fileContents);

    if (Array.isArray(parsed)) {
      catalogCache = parsed as CatalogProduct[];
      lastLoadedAt = now;
      return catalogCache;
    }

    console.warn(
      "[ProductCatalog] Expected catalog JSON to be an array. Falling back to empty list.",
    );
    catalogCache = [];
    lastLoadedAt = now;
    return catalogCache;
  } catch (error) {
    console.error(
      `[ProductCatalog] Failed to load catalog from ${filePath}:`,
      error,
    );
    catalogCache = [];
    lastLoadedAt = now;
    return catalogCache;
  }
}

function scoreProduct(product: CatalogProduct, query: string): number {
  const name = product.name?.toLowerCase() ?? "";
  const permalink = product.permalink?.toLowerCase() ?? "";
  const tags = product.tags?.map((tag) => tag.name?.toLowerCase() ?? "") ?? [];
  const categories =
    product.categories?.map((cat) => cat.name?.toLowerCase() ?? "") ?? [];

  const haystack = [name, permalink, ...tags, ...categories].join(" ");

  if (!haystack) return 0;

  const tokens = query
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) return 0;

  let score = 0;

  tokens.forEach((token) => {
    if (name === token) score += 80;
    if (name.includes(token)) score += 40;
    if (permalink.includes(token)) score += 20;

    tags.forEach((tag) => {
      if (tag.includes(token)) score += 10;
    });

    categories.forEach((category) => {
      if (category.includes(token)) score += 10;
    });
  });

  if (name.includes(query)) {
    score += 30;
  }

  return score;
}

export interface CatalogMatch {
  name: string;
  permalink?: string;
  price?: string;
  stockStatus?: string;
  image?: string;
}

export function findCatalogMatches(query: string, limit = 3): CatalogMatch[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const catalog = loadCatalog();

  const ranked = catalog
    .map((product) => ({ product, score: scoreProduct(product, trimmed) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    return [];
  }

  return ranked.slice(0, limit).map(({ product }) => ({
    name: product.name || "TradeZone Product",
    permalink: product.permalink,
    price:
      product.price || product.sale_price || product.regular_price || undefined,
    stockStatus: product.stock_status,
    image: product.images?.[0]?.src,
  }));
}
