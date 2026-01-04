#!/usr/bin/env tsx
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

type WooProduct = {
  id: number;
  name: string;
  sku?: string | null;
  categories?: { id: number; name: string }[];
};

const PRODUCTS_PATH = path.join(
  process.cwd(),
  "public",
  "tradezone-WooCommerce-Products.json"
);

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

async function main() {
  const raw = await fs.readFile(PRODUCTS_PATH, "utf8");
  const products: WooProduct[] = JSON.parse(raw);

  const missing = products.filter((p) => !p.sku || !p.sku.trim());

  const rows = missing.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.categories?.map((c) => c.name).join(", ") || "",
    proposedSku: buildSku(p),
  }));

  const reportDir = path.join(process.cwd(), "reports");
  await fs.mkdir(reportDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = path.join(reportDir, `missing-skus-${timestamp}.json`);
  await fs.writeFile(outputPath, JSON.stringify(rows, null, 2));

  console.log(`Found ${rows.length} products without SKU.`);
  console.log(`Report saved to ${outputPath}`);
  console.table(rows.slice(0, 10));
}

main().catch((error) => {
  console.error("Failed to build missing SKU report", error);
  process.exit(1);
});
