import tradeInData from "@/data/trade_in_prices_2025.json";

export interface PriceRange {
  min: number;
  max: number;
}

interface TradeInPriceEntry {
  label: string;
  category: string;
  preowned?: PriceRange;
  brandNew?: PriceRange;
  tokens: string[];
}

const PRICE_ENTRIES: TradeInPriceEntry[] = buildPriceEntries();

function buildPriceEntries(): TradeInPriceEntry[] {
  const entriesMap = new Map<string, TradeInPriceEntry>();

  for (const [, category] of Object.entries(tradeInData.categories)) {
    if (!category) continue;
    const catName = category.name || "";

    const ensureEntry = (label: string) => {
      const key = label.toLowerCase();
      if (!entriesMap.has(key)) {
        entriesMap.set(key, {
          label,
          category: catName,
          tokens: tokenize(label),
        });
      }
      return entriesMap.get(key)!;
    };

    if (category.preowned_trade_in) {
      for (const [label, value] of Object.entries(category.preowned_trade_in)) {
        const entry = ensureEntry(label);
        entry.preowned = normalizeValue(value);
      }
    }

    if (category.brand_new_retail) {
      for (const [label, value] of Object.entries(category.brand_new_retail)) {
        const entry = ensureEntry(label);
        entry.brandNew = normalizeValue(value);
      }
    }
  }

  return Array.from(entriesMap.values());
}

function normalizeValue(value: number | [number, number]): PriceRange {
  if (Array.isArray(value)) {
    const [min, max] = value;
    return {
      min: Math.min(min, max),
      max: Math.max(min, max),
    };
  }
  return { min: value, max: value };
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function scoreEntry(queryTokens: string[], entryTokens: string[]): number {
  if (entryTokens.length === 0) return 0;
  const matches = entryTokens.filter((token) => queryTokens.includes(token));
  return matches.length / entryTokens.length;
}

export interface TradeInPriceMatch {
  label: string;
  category: string;
  preowned?: PriceRange;
  brandNew?: PriceRange;
}

export function findTradeInPriceMatch(
  query: string,
): TradeInPriceMatch | null {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return null;

  let best: { entry: TradeInPriceEntry; score: number } | null = null;

  for (const entry of PRICE_ENTRIES) {
    const score = scoreEntry(queryTokens, entry.tokens);
    if (score === 1) {
      return {
        label: entry.label,
        category: entry.category,
        preowned: entry.preowned,
        brandNew: entry.brandNew,
      };
    }
    if (!best || score > best.score) {
      best = { entry, score };
    }
  }

  if (best && best.score >= 0.5) {
    return {
      label: best.entry.label,
      category: best.entry.category,
      preowned: best.entry.preowned,
      brandNew: best.entry.brandNew,
    };
  }

  return null;
}

export function formatPriceRange(range?: PriceRange): string | null {
  if (!range) return null;
  if (range.min === range.max) {
    return `S$${range.min}`;
  }
  return `S$${range.min}–${range.max}`;
}
