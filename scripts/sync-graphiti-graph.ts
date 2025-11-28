import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

type CatalogCondition = {
  condition: string;
  label?: string;
  basePrice?: number | null;
  instalmentTotal?: number | null;
  tradeIn?: {
    min?: number | null;
    max?: number | null;
  } | null;
};

type CatalogModel = {
  model_id: string;
  title: string;
  kind?: string | null;
  bundle?: string | null;
  region?: string | null;
  storage?: string | null;
  options?: Record<string, unknown> | null;
  categories?: string[];
  tags?: string[];
  warranty_notes?: string[];
  aliases?: string[];
  conditions: CatalogCondition[];
  source?: {
    productId?: number;
    productName?: string;
    permalink?: string;
  };
};

type CatalogFamily = {
  family_id: string;
  title: string;
  instalment_factor?: number | null;
  bnpl_providers?: Array<{
    id: string;
    name: string;
    months: number[];
  }>;
  warranties?: Record<string, string>;
  models: CatalogModel[];
};

type ProductsMasterFile = {
  families: CatalogFamily[];
};

type TradeGridEntry = {
  id?: string;
  metadata?: {
    product_family?: string;
    product_model?: string;
    variant?: string;
    condition?: string;
    trade_in_value_min_sgd?: number | null;
    trade_in_value_max_sgd?: number | null;
    brand_new_price_sgd?: number | null;
    source?: string;
    confidence?: number;
    price_grid_version?: string;
  };
  text?: string;
};

type GraphitiMessage = {
  uuid: string;
  name: string;
  role_type: "system";
  role: string;
  content: string;
  timestamp: string;
  source_description: string;
};

const GRAPHITI_BATCH_SIZE = 25;
const GRAPHITI_ROLE = "CatalogSync";

const baseUrl = process.env.GRAPHTI_BASE_URL?.replace(/\/$/, "");
const apiKey = process.env.GRAPHTI_API_KEY;
const groupId = process.env.GRAPHTI_DEFAULT_GROUP_ID || "tradezone-main";

if (!baseUrl || !apiKey) {
  console.error(
    "Set GRAPHTI_BASE_URL and GRAPHTI_API_KEY in your environment before running this sync.",
  );
  process.exit(1);
}

function formatCurrency(value: number | null | undefined): string | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return `S$${value.toFixed(0)}`;
}

function describeRetailPrices(conditions: CatalogCondition[]): string | null {
  const parts = conditions
    .filter((condition) => typeof condition.basePrice === "number")
    .map((condition) => {
      const label = condition.label || condition.condition;
      const price = formatCurrency(condition.basePrice ?? null);
      return price ? `${label}: ${price}` : null;
    })
    .filter(Boolean) as string[];

  return parts.length ? `Retail pricing — ${parts.join("; ")}.` : null;
}

function describeTradeInPrices(conditions: CatalogCondition[]): string | null {
  const parts = conditions
    .map((condition) => {
      if (!condition.tradeIn) return null;
      const { min, max } = condition.tradeIn;
      if (typeof min !== "number" && typeof max !== "number") return null;
      const label = condition.label || condition.condition;
      if (typeof min === "number" && typeof max === "number" && min !== max) {
        return `${label}: ${formatCurrency(min)} to ${formatCurrency(max)}`;
      }
      const amount = formatCurrency((min ?? max) ?? null);
      return amount ? `${label}: ${amount}` : null;
    })
    .filter(Boolean) as string[];

  return parts.length ? `Trade-in estimates — ${parts.join("; ")}.` : null;
}

function buildModelMessage(family: CatalogFamily, model: CatalogModel): GraphitiMessage | null {
  const lines: string[] = [];
  lines.push(
    `Catalog model ${model.title} (model ${model.model_id}) belongs to family ${family.title}.`,
  );
  if (model.kind) lines.push(`Kind: ${model.kind}.`);
  if (model.storage) lines.push(`Storage: ${model.storage}.`);
  if (model.bundle) lines.push(`Bundle: ${model.bundle}.`);
  if (model.region) lines.push(`Region: ${model.region}.`);
  if (model.categories?.length) {
    lines.push(`Categories: ${model.categories.join(", ")}.`);
  }
  if (model.tags?.length) {
    lines.push(`Tags: ${model.tags.join(", ")}.`);
  }
  if (model.aliases?.length) {
    lines.push(`Aliases include: ${model.aliases.join(", ")}.`);
  }
  if (model.warranty_notes?.length) {
    lines.push(`Warranty notes: ${model.warranty_notes.join(" | ")}.`);
  }
  const retail = describeRetailPrices(model.conditions);
  if (retail) lines.push(retail);
  const tradeIn = describeTradeInPrices(model.conditions);
  if (tradeIn) lines.push(tradeIn);
  if (model.source?.permalink) {
    lines.push(`Product link: ${model.source.permalink}.`);
  }

  const content = lines.join(" ").trim();
  if (!content) {
    return null;
  }

  return {
    uuid: crypto.randomUUID(),
    name: `catalog-${model.model_id}`,
    role_type: "system",
    role: GRAPHITI_ROLE,
    content,
    timestamp: new Date().toISOString(),
    source_description: "catalog_sync",
  };
}

function buildTradeMessage(entry: TradeGridEntry, index: number): GraphitiMessage | null {
  const meta = entry.metadata || {};
  const deviceParts = [meta.product_family, meta.product_model, meta.variant].filter(Boolean);
  const deviceLabel = deviceParts.length ? deviceParts.join(" ") : entry.text || "Unknown model";
  const condition = meta.condition || "unspecified condition";
  const tradeMin = meta.trade_in_value_min_sgd ?? null;
  const tradeMax = meta.trade_in_value_max_sgd ?? null;
  const brandNew = meta.brand_new_price_sgd ?? null;
  const tradeValue = (() => {
    if (tradeMin != null && tradeMax != null && tradeMin !== tradeMax) {
      return `${formatCurrency(tradeMin)} to ${formatCurrency(tradeMax)}`;
    }
    const single = formatCurrency((tradeMin ?? tradeMax) ?? null);
    return single ?? null;
  })();

  const lines: string[] = [];
  lines.push(`Trade grid entry ${deviceLabel} (${condition}).`);
  if (tradeValue) {
    lines.push(`Trade-in value: ${tradeValue}.`);
  }
  if (typeof brandNew === "number") {
    lines.push(`Brand-new price: ${formatCurrency(brandNew)}.`);
  }
  if (meta.price_grid_version) {
    lines.push(`Grid version: ${meta.price_grid_version}.`);
  }
  if (meta.source) {
    lines.push(`Source: ${meta.source}.`);
  }

  const content = lines.join(" ").trim();
  if (!content) {
    return null;
  }

  return {
    uuid: crypto.randomUUID(),
    name: `trade-grid-${entry.id || index}`,
    role_type: "system",
    role: GRAPHITI_ROLE,
    content,
    timestamp: new Date().toISOString(),
    source_description: "trade_grid_sync",
  };
}

async function loadCatalog(): Promise<ProductsMasterFile> {
  const catalogPath = path.join(process.cwd(), "data", "catalog", "products_master.json");
  const raw = await fs.readFile(catalogPath, "utf8");
  return JSON.parse(raw) as ProductsMasterFile;
}

async function loadTradeGrid(): Promise<TradeGridEntry[]> {
  const tradeGridPath = path.join(process.cwd(), "data", "tradezone_price_grid.jsonl");
  const raw = await fs.readFile(tradeGridPath, "utf8");
  return raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as TradeGridEntry;
      } catch (error) {
        console.warn("[graphiti-sync] Failed to parse trade grid line", { line, error });
        return null;
      }
    })
    .filter((entry): entry is TradeGridEntry => Boolean(entry));
}

function chunkMessages<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function uploadBatch(messages: GraphitiMessage[], batchIndex: number, totalBatches: number) {
  const response = await fetch(`${baseUrl}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey!,
    },
    body: JSON.stringify({
      group_id: groupId,
      messages,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Graphiti sync failed for batch ${batchIndex}/${totalBatches}: ${response.status} ${response.statusText} ${body}`,
    );
  }
  console.log(
    `[graphiti-sync] Uploaded batch ${batchIndex}/${totalBatches} (${messages.length} records)`,
  );
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const catalog = await loadCatalog();
  const tradeEntries = await loadTradeGrid();

  const messages: GraphitiMessage[] = [];

  for (const family of catalog.families) {
    for (const model of family.models) {
      const message = buildModelMessage(family, model);
      if (message) {
        messages.push(message);
      }
    }
  }

  tradeEntries.forEach((entry, index) => {
    const message = buildTradeMessage(entry, index);
    if (message) {
      messages.push(message);
    }
  });

  console.log(
    `[graphiti-sync] Prepared ${messages.length} messages for group ${groupId} (${catalog.families.length} families, ${tradeEntries.length} trade rows).`,
  );

  if (dryRun) {
    console.log("[graphiti-sync] Dry run enabled. Sample message:");
    console.log(messages[0]);
    return;
  }

  const batches = chunkMessages(messages, GRAPHITI_BATCH_SIZE);
  for (let i = 0; i < batches.length; i += 1) {
    await uploadBatch(batches[i], i + 1, batches.length);
  }
  console.log("[graphiti-sync] Completed Graphiti catalog sync.");
}

main().catch((error) => {
  console.error("[graphiti-sync] Sync failed", error);
  process.exit(1);
});
