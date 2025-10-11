import fsp from "node:fs/promises";
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
let catalogPromise: Promise<CatalogProduct[]> | null = null;

const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour (catalog refreshes weekly)

function resolveCatalogPath(): string {
  if (process.env.WOOCOMMERCE_PRODUCT_JSON_PATH) {
    return process.env.WOOCOMMERCE_PRODUCT_JSON_PATH;
  }

  return path.resolve(
    process.cwd(),
    "../tradezone_md_pipeline/product-json/tradezone-WooCommerce-Products.json",
  );
}

function isHttpPath(target: string): boolean {
  return target.startsWith("http://") || target.startsWith("https://");
}

async function readCatalogFromSource(
  filePath: string,
): Promise<CatalogProduct[]> {
  if (isHttpPath(filePath)) {
    console.log(`[ProductCatalog] Fetching catalog from URL: ${filePath}`);
    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} when fetching catalog`);
    }
    const parsed = await response.json();
    if (!Array.isArray(parsed)) {
      throw new Error("Catalog URL did not return an array payload");
    }
    return parsed as CatalogProduct[];
  }

  console.log(`[ProductCatalog] Reading catalog from file: ${filePath}`);
  const fileContents = await fsp.readFile(filePath, "utf8");
  const parsed = JSON.parse(fileContents);

  if (!Array.isArray(parsed)) {
    throw new Error("Catalog file did not contain an array payload");
  }

  return parsed as CatalogProduct[];
}

async function loadCatalog(): Promise<CatalogProduct[]> {
  const now = Date.now();
  if (catalogCache && now - lastLoadedAt < CACHE_TTL_MS) {
    return catalogCache;
  }

  const filePath = resolveCatalogPath();

  if (!catalogPromise) {
    catalogPromise = readCatalogFromSource(filePath)
      .then((products) => {
        catalogCache = products;
        lastLoadedAt = Date.now();
        console.log(
          `[ProductCatalog] Catalog loaded with ${products.length} products.`,
        );
        return products;
      })
      .catch((error) => {
        console.error(
          `[ProductCatalog] Failed to load catalog from ${filePath}:`,
          error,
        );
        catalogCache = [];
        lastLoadedAt = Date.now();
        return [];
      })
      .finally(() => {
        catalogPromise = null;
      });
  }

  return catalogPromise!;
}

function scoreProduct(product: CatalogProduct, query: string): number {
  const name = product.name?.toLowerCase() ?? "";
  const description = product.description?.toLowerCase() ?? "";
  const shortDescription = product.short_description?.toLowerCase() ?? "";
  const permalink = product.permalink?.toLowerCase() ?? "";
  const tags = product.tags?.map((tag) => tag.name?.toLowerCase() ?? "") ?? [];
  const categories =
    product.categories?.map((cat) => cat.name?.toLowerCase() ?? "") ?? [];

  const haystack = [
    name,
    description,
    shortDescription,
    permalink,
    ...tags,
    ...categories,
  ].join(" ");

  if (!haystack) return 0;

  const tokens = query
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) return 0;

  let score = 0;

  tokens.forEach((token) => {
    // Exact name match
    if (name === token) score += 80;
    // Name contains token
    if (name.includes(token)) score += 40;
    // Description contains token (for detailed searches)
    if (description.includes(token)) score += 15;
    if (shortDescription.includes(token)) score += 15;
    // Permalink contains token
    if (permalink.includes(token)) score += 20;

    // Tags match
    tags.forEach((tag) => {
      if (tag.includes(token)) score += 10;
    });

    // Category match
    categories.forEach((category) => {
      if (category.includes(token)) score += 10;
    });
  });

  // Bonus for full query match in name
  if (name.includes(query)) {
    score += 30;
  }

  // Bonus for full query match in description
  if (description.includes(query) || shortDescription.includes(query)) {
    score += 20;
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

export async function findCatalogMatches(
  query: string,
  limit = 3,
): Promise<CatalogMatch[]> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const catalog = await loadCatalog();

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
