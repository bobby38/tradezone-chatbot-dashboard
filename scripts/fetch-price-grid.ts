#!/usr/bin/env ts-node

import { parse } from "node-html-parser";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.sc" });
dotenv.config({ path: ".env.local", override: false });

const PAGE_URL =
  process.env.TRADE_PRICE_GRID_URL || "https://tradezone.sg/trade-page/";
const PRICE_GRID_VERSION =
  process.env.PRICE_GRID_VERSION || new Date().toISOString().slice(0, 10);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type ParsedEntry = {
  product_family: string;
  product_model: string;
  variant: string | null;
  condition: string;
  trade_in_value_min: number | null;
  trade_in_value_max: number | null;
  brand_new_price: number | null;
  source: string;
  source_url: string;
  price_grid_version: string;
};

function normalizeCondition(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("preowned")) return "preowned";
  if (lower.includes("brand")) return "brand_new";
  return lower.replace(/[^a-z0-9_ ]/g, "").trim() || "unspecified";
}

function sanitizeLine(line: string): string {
  return line
    .replace(/[\u{1f300}-\u{1f9ff}\u{2600}-\u{27bf}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePrice(text: string): {
  min: number | null;
  max: number | null;
} {
  const cleaned = text
    .replace(/\$/g, "")
    .replace(/s\$/gi, "")
    .replace(/sgd/gi, "")
    .replace(/,/g, "")
    .trim();
  if (!cleaned) {
    return { min: null, max: null };
  }
  const range = cleaned.split(/\s*-\s*/);
  const min = Number(range[0]);
  const max = range.length > 1 ? Number(range[1]) : Number(range[0]);
  if (Number.isNaN(min)) return { min: null, max: null };
  if (Number.isNaN(max)) return { min, max: min };
  return { min, max };
}

async function fetchHtml(): Promise<string> {
  const response = await fetch(PAGE_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${response.status}`);
  }
  return await response.text();
}

function extractEntries(html: string): ParsedEntry[] {
  const root = parse(html);
  const paragraphs = root.querySelectorAll("p");
  const entries: ParsedEntry[] = [];
  let currentFamily = "";
  let currentCondition = "";

  for (const p of paragraphs) {
    const raw = p.innerHTML.replace(/<br\s*\/>/gi, "\n").replace(/<br>/gi, "\n");
    const lines = raw
      .split(/\n+/)
      .map((line) => sanitizeLine(line))
      .filter(Boolean);

    for (const line of lines) {
      if (!line.includes(":")) {
        if (/preowned/i.test(line) || /brand/i.test(line)) {
          currentCondition = line;
        } else {
          currentFamily = line.replace(/^[0-9#️⃣\.\- ]+/, "").trim();
        }
        continue;
      }

      const [namePart, pricePart] = line.split(/:\s*/);
      if (!namePart || !pricePart) continue;

      const { min, max } = parsePrice(pricePart);
      const normalizedCondition = normalizeCondition(currentCondition);

      const entry: ParsedEntry = {
        product_family: currentFamily || "Unknown",
        product_model: namePart.trim(),
        variant: "",
        condition: normalizedCondition,
        trade_in_value_min:
          normalizedCondition === "preowned" ? min : null,
        trade_in_value_max:
          normalizedCondition === "preowned" ? max : null,
        brand_new_price:
          normalizedCondition === "brand_new" ? max ?? min : null,
        source: "trade_page",
        source_url: PAGE_URL,
        price_grid_version: PRICE_GRID_VERSION,
      };

      entries.push(entry);
    }
  }

  return entries;
}

async function upsertEntries(entries: ParsedEntry[]) {
  const { error } = await supabase.from("trade_price_grid").upsert(entries, {
    onConflict: "product_family,product_model,condition",
  });
  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`);
  }
}

async function main() {
  console.log(`[Grid] Fetching ${PAGE_URL}`);
  const html = await fetchHtml();
  const entries = extractEntries(html);
  if (!entries.length) {
    throw new Error("No entries parsed from the trade page");
  }
  console.log(`[Grid] Parsed ${entries.length} entries. Upserting…`);
  await upsertEntries(entries);
  console.log("[Grid] Upsert complete.");
}

main().catch((err) => {
  console.error("[Grid] Sync failed", err);
  process.exit(1);
});
