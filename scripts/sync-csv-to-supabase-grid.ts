#!/usr/bin/env tsx

/**
 * Sync the CSV price grid to Supabase trade_price_grid table
 * This ensures the database has the latest pricing from the CSV file
 */

import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CSV_PATH = path.join(
  process.cwd(),
  "scripts",
  "Tradezone Price Grid Nov 12 2025.csv",
);

interface CSVRow {
  product_family: string;
  product_model: string;
  variant: string;
  condition: string;
  trade_in_value_min_sgd: string;
  trade_in_value_max_sgd: string;
  brand_new_price_sgd: string;
  source: string;
  confidence: string;
  notes: string;
}

async function main() {
  console.log("[GridSync] Reading CSV:", CSV_PATH);

  const csvContent = fs.readFileSync(CSV_PATH, "utf-8");
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
  }) as CSVRow[];

  console.log(`[GridSync] Parsed ${records.length} rows from CSV`);

  // Transform CSV rows to database format
  const entries = records.map((row) => ({
    product_family: row.product_family || "Unknown",
    product_model: row.product_model || "",
    variant: row.variant || "",
    condition: row.condition || "preowned",
    trade_in_value_min: row.trade_in_value_min_sgd
      ? parseFloat(row.trade_in_value_min_sgd)
      : null,
    trade_in_value_max: row.trade_in_value_max_sgd
      ? parseFloat(row.trade_in_value_max_sgd)
      : null,
    brand_new_price: row.brand_new_price_sgd
      ? parseFloat(row.brand_new_price_sgd)
      : null,
    source: row.source || "csv_import",
    source_url: CSV_PATH,
    price_grid_version: "2025-11-12",
  }));

  // Delete old entries
  console.log("[GridSync] Deleting old entries from trade_price_grid...");
  const { error: deleteError } = await supabase
    .from("trade_price_grid")
    .delete()
    .neq("product_family", "___NONEXISTENT___"); // Delete all

  if (deleteError) {
    console.error("[GridSync] Delete failed:", deleteError);
    process.exit(1);
  }

  // Insert new entries
  console.log(`[GridSync] Inserting ${entries.length} new entries...`);
  const { error: insertError } = await supabase
    .from("trade_price_grid")
    .insert(entries);

  if (insertError) {
    console.error("[GridSync] Insert failed:", insertError);
    process.exit(1);
  }

  console.log("[GridSync] ✅ Successfully synced CSV to Supabase!");
  console.log(`[GridSync] Total entries: ${entries.length}`);

  // Verify PS5 pricing
  const { data: ps5Data } = await supabase
    .from("trade_price_grid")
    .select("*")
    .ilike("product_model", "%PS5%")
    .eq("condition", "preowned");

  console.log("\n[GridSync] PS5 Pricing Verification:");
  ps5Data?.forEach((row) => {
    console.log(
      `  - ${row.product_model} ${row.variant}: $${row.trade_in_value_min}-$${row.trade_in_value_max}`,
    );
  });
}

main().catch((err) => {
  console.error("[GridSync] Failed:", err);
  process.exit(1);
});
