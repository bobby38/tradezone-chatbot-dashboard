#!/usr/bin/env tsx
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import dotenv from "dotenv";
import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const site = process.env.WC_SITE;
const key = process.env.WC_KEY;
const secret = process.env.WC_SECRET;

if (!site || !key || !secret) {
  console.error("❌ Missing WC_SITE / WC_KEY / WC_SECRET env vars.");
  process.exit(1);
}

const WooCommerce = new WooCommerceRestApi({
  url: site,
  consumerKey: key,
  consumerSecret: secret,
  version: "wc/v3",
});

type WooCategory = { id: number; name: string };
type WooProduct = {
  id: number;
  name: string;
  sku?: string | null;
  categories?: WooCategory[];
};

function normalizeSegment(value: string, fallback: string): string {
  const cleaned = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
  return cleaned || fallback;
}

function buildSku(product: WooProduct): string {
  const categoryName = product.categories?.[0]?.name || "GEN";
  const categorySegment = normalizeSegment(categoryName, "GEN");
  const nameSegment = normalizeSegment(product.name, "SKU");
  const hash = crypto
    .createHash("sha1")
    .update(`${product.id}:${product.name}`)
    .digest("hex")
    .slice(0, 4)
    .toUpperCase();

  return `TZ-${categorySegment}-${nameSegment}-${hash}`;
}

async function fetchAllProducts(): Promise<WooProduct[]> {
  const results: WooProduct[] = [];
  let page = 1;
  while (true) {
    const response = await WooCommerce.get("products", {
      per_page: 100,
      page,
      status: "publish",
      orderby: "date",
      order: "desc",
    });
    const batch: WooProduct[] = response.data;
    if (!batch.length) break;
    results.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  return results;
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "⚠️ APPLY MODE" : "Dry run mode - no changes will be written");

  const products = await fetchAllProducts();
  const missing = products.filter((p) => !p.sku || !p.sku.trim());

  console.log(`Found ${missing.length} published products missing SKUs.`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportsDir = path.join(process.cwd(), "reports");
  await fs.mkdir(reportsDir, { recursive: true });
  const logPath = path.join(reportsDir, `sku-updates-${timestamp}.csv`);
  if (apply) {
    await fs.writeFile(logPath, "product_id,old_sku,new_sku,name\n");
  }

  const batchSize = 25;
  for (let i = 0; i < missing.length; i += batchSize) {
    const batch = missing.slice(i, i + batchSize);
    console.log(`Batch ${i / batchSize + 1}: preparing ${batch.length} products`);

    for (const product of batch) {
      const newSku = buildSku(product);
      console.log(`• ${product.id} ${product.name} → ${newSku}`);
      if (!apply) continue;
      try {
        await WooCommerce.put(`products/${product.id}`, { sku: newSku });
        await fs.appendFile(
          logPath,
          `${product.id},${product.sku || ""},${newSku},"${product.name.replace(/"/g, '""')}"\n`
        );
      } catch (error) {
        console.error(`Failed to update product ${product.id}`, error);
        throw error;
      }
    }
  }

  if (apply) {
    console.log(`✅ Updates complete. Log saved to ${logPath}`);
  } else {
    console.log("Dry run complete. Re-run with --apply to write changes.");
  }
}

main().catch((error) => {
  console.error("SKU update script failed", error);
  process.exit(1);
});
