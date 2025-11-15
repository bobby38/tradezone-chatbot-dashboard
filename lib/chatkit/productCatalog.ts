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

const EXACT_KEYWORD_OVERRIDES: Record<string, CatalogMatch> = {
  "switch 2": {
    name: "Nintendo Switch 2 (Brand New)",
    price: "500.00",
    stockStatus: "instock",
    permalink: "https://tradezone.sg/product/nintendo-switch-2",
  },
};

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

  if (!name && !description && !shortDescription) return 0;

  const queryTokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (queryTokens.length === 0) return 0;

  let score = 0;

  queryTokens.forEach((token) => {
    const nameWords = name.split(/\s+/);
    let bestNameMatch = 0;

    nameWords.forEach((word) => {
      const distance = levenshteinDistance(token, word);
      const similarity = 1 - distance / Math.max(token.length, word.length);
      if (similarity > 0.7) {
        // Threshold for a decent match
        bestNameMatch = Math.max(bestNameMatch, similarity);
      }
    });

    if (bestNameMatch > 0) {
      score += 50 * bestNameMatch; // Main score from name matching
    }

    if (description.includes(token) || shortDescription.includes(token)) {
      score += 10; // Bonus for appearing in description
    }
  });

  // Bonus for all query tokens appearing in the name
  if (queryTokens.every((token) => name.includes(token))) {
    score += 40;
  }

  // Big bonus for exact match of the full query
  if (name.includes(query)) {
    score += 60;
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

function levenshteinDistance(a: string, b: string): number {
  const matrix = Array(b.length + 1)
    .fill(null)
    .map(() => Array(a.length + 1).fill(null));
  for (let i = 0; i <= a.length; i += 1) {
    matrix[0][i] = i;
  }
  for (let j = 0; j <= b.length; j += 1) {
    matrix[j][0] = j;
  }
  for (let j = 1; j <= b.length; j += 1) {
    for (let i = 1; i <= a.length; i += 1) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // deletion
        matrix[j - 1][i] + 1, // insertion
        matrix[j - 1][i - 1] + indicator, // substitution
      );
    }
  }
  return matrix[b.length][a.length];
}

export async function findClosestMatch(query: string): Promise<string | null> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return null;

  const catalog = await loadCatalog();
  let closestMatch: string | null = null;
  let minDistance = Infinity;

  for (const product of catalog) {
    const productName = product.name?.toLowerCase();
    if (productName) {
      const distance = levenshteinDistance(trimmed, productName);
      if (distance < minDistance) {
        minDistance = distance;
        closestMatch = product.name;
      }
    }
  }

  // Only return a suggestion if the distance is reasonably small
  if (closestMatch && minDistance <= 3) {
    return closestMatch;
  }

  return null;
}

const STOP_WORDS = new Set([
  "any",
  "the",
  "for",
  "find",
  "show",
  "give",
  "please",
  "some",
  "get",
  "need",
  "want",
  "have",
  "got",
]);

export async function findCatalogMatches(
  query: string,
  limit = 3,
): Promise<CatalogMatch[]> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  for (const [keyword, match] of Object.entries(EXACT_KEYWORD_OVERRIDES)) {
    if (trimmed.includes(keyword)) {
      return [match];
    }
  }

  const catalog = await loadCatalog();
  const rawTokens = trimmed.split(/\s+/).filter(Boolean);

  // Smart filtering: keep "game"/"games" if it's part of a meaningful query
  const filteredTokens = rawTokens.filter((token) => {
    if (token.length < 3) return false;
    if (STOP_WORDS.has(token)) return false;
    // Keep "game"/"games" unless it's ONLY that word with stop words
    if (token === "game" || token === "games" || token === "gaming") {
      // Keep if there are other meaningful tokens
      return rawTokens.some(
        (t) =>
          t !== token &&
          t.length >= 3 &&
          !STOP_WORDS.has(t) &&
          t !== "game" &&
          t !== "games" &&
          t !== "gaming",
      );
    }
    return true;
  });

  const tokensToUse = filteredTokens.length ? filteredTokens : rawTokens;
  const primaryKeyword =
    tokensToUse.find((token) => !STOP_WORDS.has(token)) || tokensToUse[0];

  const ranked = catalog
    .map((product) => {
      const name = (product.name || "").toLowerCase();
      const categories = (product.categories || []).map(
        (c) => c.name?.toLowerCase() || "",
      );
      const description = (
        product.short_description ||
        product.description ||
        ""
      ).toLowerCase();
      const matchedTokens = tokensToUse.filter(
        (token) =>
          name.includes(token) ||
          categories.some((cat) => cat.includes(token)) ||
          description.includes(token),
      );
      const score = matchedTokens.length
        ? scoreProduct(product, trimmed) + matchedTokens.length * 150
        : 0;
      return { product, score, matched: matchedTokens.length };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => {
      if (b.matched !== a.matched) return b.matched - a.matched;
      return b.score - a.score;
    });

  let sliced = ranked.slice(0, limit);
  if (primaryKeyword) {
    const keyword = primaryKeyword.toLowerCase();
    const strictMatches = ranked.filter(({ product }) =>
      (product.name || "").toLowerCase().includes(keyword),
    );
    if (strictMatches.length > 0) {
      sliced = strictMatches.slice(0, limit);
    }
  }

  return sliced.map(({ product }) => ({
    name: product.name || "TradeZone Product",
    permalink: product.permalink,
    price:
      product.price || product.sale_price || product.regular_price || undefined,
    stockStatus: product.stock_status,
    image: product.images?.[0]?.src,
  }));
}
