import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { config as loadEnv } from "dotenv";

const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  loadEnv({ path: envLocalPath });
} else {
  loadEnv();
}

const API_BASE = (process.env.WOOCOMMERCE_API_BASE ?? "https://tradezone.sg/wp-json/wc/v3").replace(/\/$/, "");
const CONSUMER_KEY = process.env.WOOCOMMERCE_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.WOOCOMMERCE_CONSUMER_SECRET;
const OUTPUT_PATH = process.env.WOOCOMMERCE_PRODUCT_JSON_PATH
  ? path.resolve(process.cwd(), process.env.WOOCOMMERCE_PRODUCT_JSON_PATH)
  : path.resolve(
      process.cwd(),
      "../tradezone_md_pipeline/product-json/tradezone-WooCommerce-Products.json",
    );

if (!CONSUMER_KEY || !CONSUMER_SECRET) {
  console.error(
    "Missing WooCommerce credentials. Set WOOCOMMERCE_CONSUMER_KEY and WOOCOMMERCE_CONSUMER_SECRET.",
  );
  process.exit(1);
}

async function fetchPage(page, perPage) {
  const url = new URL(`${API_BASE}/products`);
  url.searchParams.set("consumer_key", CONSUMER_KEY);
  url.searchParams.set("consumer_secret", CONSUMER_SECRET);
  url.searchParams.set("status", "publish");
  url.searchParams.set("orderby", "modified");
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("page", String(page));

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`WooCommerce API error ${res.status}: ${body}`);
  }

  return res.json();
}

async function fetchAllProducts() {
  const perPage = 100;
  let page = 1;
  const products = [];

  while (true) {
    const batch = await fetchPage(page, perPage);
    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }

    products.push(...batch);

    if (batch.length < perPage) {
      break;
    }

    page += 1;
  }

  return products;
}

function trimProduct(product) {
  return {
    id: product.id,
    name: product.name,
    permalink: product.permalink,
    sku: product.sku,
    type: product.type,
    price: product.price,
    regular_price: product.regular_price,
    sale_price: product.sale_price,
    stock_status: product.stock_status,
    date_created: product.date_created,
    date_modified: product.date_modified,
    short_description: product.short_description,
    description: product.description,
    categories: (product.categories || []).map(({ id, name, slug }) => ({
      id,
      name,
      slug,
    })),
    tags: (product.tags || []).map(({ id, name, slug }) => ({ id, name, slug })),
    images: (product.images || []).map(({ id, src, alt }) => ({ id, src, alt })),
    attributes: product.attributes,
    variations: product.variations,
  };
}

async function writeCatalog(products) {
  const trimmed = products.map(trimProduct);
  const dir = path.dirname(OUTPUT_PATH);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(OUTPUT_PATH, JSON.stringify(trimmed, null, 2), "utf8");
}

async function main() {
  try {
    console.log("[Catalog] Fetching products from WooCommerce...");
    const products = await fetchAllProducts();
    console.log(`[Catalog] Retrieved ${products.length} products.`);
    await writeCatalog(products);
    console.log(`[Catalog] Saved catalog to ${OUTPUT_PATH}`);
  } catch (error) {
    console.error("[Catalog] Refresh failed:", error);
    process.exit(1);
  }
}

main();
