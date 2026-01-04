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

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const ENABLE_ENRICHMENT = process.env.ENABLE_PRODUCT_ENRICHMENT === "true";

const API_BASE = (
  process.env.WOOCOMMERCE_API_BASE ?? "https://tradezone.sg/wp-json/wc/v3"
).replace(/\/$/, "");
const CONSUMER_KEY = process.env.WOOCOMMERCE_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.WOOCOMMERCE_CONSUMER_SECRET;
// Determine output path - if WOOCOMMERCE_PRODUCT_JSON_PATH is a URL, save to local public directory
function resolveOutputPath() {
  const envPath = process.env.WOOCOMMERCE_PRODUCT_JSON_PATH;

  if (!envPath) {
    // Default: save to parent pipeline directory
    return path.resolve(
      process.cwd(),
      "../tradezone_md_pipeline/product-json/tradezone-WooCommerce-Products.json",
    );
  }

  if (envPath.startsWith("http://") || envPath.startsWith("https://")) {
    // If it's a URL, save locally to public directory (you'll need to upload manually or via CI)
    return path.resolve(
      process.cwd(),
      "public/tradezone-WooCommerce-Products.json",
    );
  }

  // Otherwise treat as local path
  return path.resolve(process.cwd(), envPath);
}

const OUTPUT_PATH = resolveOutputPath();

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

async function enrichProductWithPerplexity(product) {
  if (!PERPLEXITY_API_KEY || !ENABLE_ENRICHMENT) {
    return null;
  }

  const categories = (product.categories || []).map((c) => c.name).join(", ");
  const isGame = /game/i.test(categories);

  if (!isGame) {
    return null; // Only enrich games for now (can expand later)
  }

  try {
    const prompt = `Game: ${product.name}

Return ONLY 3-5 single keywords (lowercase, space-separated):
- Genre: sports, racing, rpg, shooter, adventure, puzzle, fighting, strategy
- Sport type: basketball, football, soccer, skateboard, baseball (if applicable)
- Gameplay: multiplayer, story, open-world, competitive

Example output: "sports basketball multiplayer competitive"
Output:`;

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-sonar-small-128k-online",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 50,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      console.warn(`[Enrichment] Perplexity API error for ${product.name}`);
      return null;
    }

    const data = await response.json();
    const enrichment = data.choices?.[0]?.message?.content?.trim() || null;
    return enrichment;
  } catch (error) {
    console.warn(`[Enrichment] Failed for ${product.name}:`, error.message);
    return null;
  }
}

function trimProduct(product, enrichment = null) {
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
    enrichment: enrichment, // Add semantic metadata
    categories: (product.categories || []).map(({ id, name, slug }) => ({
      id,
      name,
      slug,
    })),
    tags: (product.tags || []).map(({ id, name, slug }) => ({
      id,
      name,
      slug,
    })),
    images: (product.images || []).map(({ id, src, alt }) => ({
      id,
      src,
      alt,
    })),
    attributes: product.attributes,
    variations: product.variations,
  };
}

async function writeCatalog(products) {
  const trimmed = [];

  if (ENABLE_ENRICHMENT && PERPLEXITY_API_KEY) {
    console.log("[Catalog] Enriching products with Perplexity (games only)...");
    let enrichedCount = 0;

    for (const product of products) {
      const enrichment = await enrichProductWithPerplexity(product);
      trimmed.push(trimProduct(product, enrichment));

      if (enrichment) {
        enrichedCount++;
        if (enrichedCount % 10 === 0) {
          console.log(`[Catalog] Enriched ${enrichedCount} products...`);
        }
      }

      // Rate limit: 10 requests per minute for free tier
      if (enrichment) {
        await new Promise((resolve) => setTimeout(resolve, 6000));
      }
    }

    console.log(
      `[Catalog] ✅ Enriched ${enrichedCount}/${products.length} products`,
    );
  } else {
    console.log(
      "[Catalog] Enrichment disabled (set ENABLE_PRODUCT_ENRICHMENT=true to enable)",
    );
    trimmed.push(...products.map((p) => trimProduct(p, null)));
  }

  const dir = path.dirname(OUTPUT_PATH);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(OUTPUT_PATH, JSON.stringify(trimmed, null, 2), "utf8");
}

async function uploadToAppwrite(filePath) {
  const endpoint =
    process.env.APPWRITE_ENDPOINT || process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
  const projectId =
    process.env.APPWRITE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
  const bucketId =
    process.env.APPWRITE_BUCKET_ID ||
    process.env.NEXT_PUBLIC_APPWRITE_BUCKET_ID;
  const apiKey = process.env.APPWRITE_API_KEY;

  if (!endpoint || !projectId || !bucketId || !apiKey) {
    console.warn(
      "[Catalog] Appwrite credentials not configured, skipping upload",
    );
    return null;
  }

  try {
    console.log("[Catalog] Uploading to Appwrite Storage...");

    const fileContent = await fsp.readFile(filePath);
    const fileId = "tradezone-WooCommerce-Products.json";

    // Delete existing file if it exists
    try {
      await fetch(`${endpoint}/storage/buckets/${bucketId}/files/${fileId}`, {
        method: "DELETE",
        headers: {
          "X-Appwrite-Project": projectId,
          "X-Appwrite-Key": apiKey,
        },
      });
      console.log("[Catalog] Deleted old catalog from Appwrite");
    } catch (deleteError) {
      // File doesn't exist, that's fine
    }

    // Upload new file
    const formData = new FormData();
    const blob = new Blob([fileContent], { type: "application/json" });
    formData.append("fileId", fileId);
    formData.append("file", blob, fileId);

    const uploadResponse = await fetch(
      `${endpoint}/storage/buckets/${bucketId}/files`,
      {
        method: "POST",
        headers: {
          "X-Appwrite-Project": projectId,
          "X-Appwrite-Key": apiKey,
        },
        body: formData,
      },
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(
        `Appwrite upload failed: ${uploadResponse.status} - ${errorText}`,
      );
    }

    const uploadData = await uploadResponse.json();
    const publicUrl = `${endpoint}/storage/buckets/${bucketId}/files/${uploadData.$id}/view?project=${projectId}`;

    console.log("[Catalog] ✅ Uploaded to Appwrite!");
    console.log("[Catalog] Public URL:", publicUrl);
    return publicUrl;
  } catch (error) {
    console.error("[Catalog] Appwrite upload error:", error);
    return null;
  }
}

async function main() {
  try {
    console.log("[Catalog] Fetching products from WooCommerce...");
    const products = await fetchAllProducts();
    console.log(`[Catalog] Retrieved ${products.length} products.`);

    await writeCatalog(products);
    console.log(`[Catalog] Saved catalog to ${OUTPUT_PATH}`);

    // Upload to Appwrite
    const appwriteUrl = await uploadToAppwrite(OUTPUT_PATH);
    if (appwriteUrl) {
      console.log(
        "[Catalog] 🎉 Complete! Update WOOCOMMERCE_PRODUCT_JSON_PATH to:",
      );
      console.log(`[Catalog]    ${appwriteUrl}`);
    }
  } catch (error) {
    console.error("[Catalog] Refresh failed:", error);
    process.exit(1);
  }
}

main();
