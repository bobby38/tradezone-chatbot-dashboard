import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });
import fs from "node:fs/promises";
import { ZepClient } from "@getzep/zep-cloud";

interface ProductsMasterFile {
  families: Array<{
    family_id: string;
    title: string;
    instalment_factor?: number;
    bnpl_providers?: Array<{
      id: string;
      name: string;
      months: number[];
    }>;
    warranties?: Record<string, string>;
    models: Array<{
      model_id: string;
      title: string;
      bundle?: string | null;
      region?: string | null;
      storage?: string | null;
      options?: Record<string, unknown>;
      categories?: string[];
      tags?: string[];
      kind?: string;
      warranty_notes?: string[];
      source?: {
        productId?: number;
        productName?: string;
        permalink?: string;
      };
      aliases: string[];
      conditions: Array<{
        condition: string;
        label: string;
        basePrice: number | null;
        instalmentTotal: number | null;
        bnpl?: Array<{
          providerId: string;
          providerName: string;
          months: number;
          monthly: number;
        }>;
        tradeIn?: {
          min?: number | null;
          max?: number | null;
        } | null;
      }>;
    }>;
  }>;
}

interface TradeGridEntry {
  model?: string;
  metadata?: Record<string, any>;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function loadTradeEntries(filePath: string): Promise<TradeGridEntry[]> {
  const raw = await fs.readFile(filePath, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as TradeGridEntry;
      } catch (error) {
        console.warn("[sync-zep] Failed to parse line", { line, error });
        return null;
      }
    })
    .filter((entry): entry is TradeGridEntry => Boolean(entry));
}

async function main() {
  if (!process.env.ZEP_API_KEY) {
    console.error("ZEP_API_KEY is required to sync the catalog into Zep.");
    process.exit(1);
  }
  if (!process.env.ZEP_CATALOG_GRAPH_ID) {
    console.error(
      "ZEP_CATALOG_GRAPH_ID must be set to the target graph. Create one in Zep and copy the ID.",
    );
    process.exit(1);
  }

  const root = process.cwd();
  const catalogPath = path.join(
    root,
    "data",
    "catalog",
    "products_master.json",
  );
  const tradeGridPath = path.join(root, "data", "tradezone_price_grid.jsonl");

  const catalogRaw = await fs.readFile(catalogPath, "utf8");
  const catalog = JSON.parse(catalogRaw) as ProductsMasterFile;
  const tradeEntries = await loadTradeEntries(tradeGridPath);

  const client = new ZepClient({ apiKey: process.env.ZEP_API_KEY });
  const graphId = process.env.ZEP_CATALOG_GRAPH_ID;

  const requests = [];

  for (const family of catalog.families) {
    for (const model of family.models) {
      requests.push({
        type: "json" as const,
        graphId,
        sourceDescription: "products_master",
        data: JSON.stringify({
          kind: model.kind || "product",
          familyId: family.family_id,
          familyTitle: family.title,
          modelId: model.model_id,
          title: model.title,
          bundle: model.bundle ?? null,
          region: model.region ?? null,
          storage: model.storage ?? null,
          options: model.options ?? {},
          aliases: model.aliases,
          categories: model.categories ?? [],
          tags: model.tags ?? [],
          warranties: {
            family: family.warranties ?? {},
            model: model.warranty_notes ?? [],
          },
          bnplProviders: family.bnpl_providers ?? [],
          source: model.source ?? {},
          conditions: model.conditions,
        }),
      });
    }
  }

  for (const entry of tradeEntries) {
    requests.push({
      type: "json" as const,
      graphId,
      sourceDescription: "trade_in_grid",
      data: JSON.stringify({
        kind: "trade_in",
        ...entry,
      }),
    });
  }

  console.log(
    `[sync-zep] Uploading ${requests.length} catalog/trade records to Zep graph ${graphId}`,
  );
  const batches = chunkArray(requests, 20);
  for (const [index, batch] of batches.entries()) {
    await Promise.all(
      batch.map((request) =>
        client.graph
          .add(request)
          .catch((error) =>
            console.error("[sync-zep] Failed to add record", { error }),
          ),
      ),
    );
    console.log(
      `[sync-zep] Loaded batch ${index + 1}/${batches.length} (${batch.length} records)`,
    );
  }
  console.log("[sync-zep] Completed graph sync.");
}

main().catch((error) => {
  console.error("[sync-zep] Sync failed", error);
  process.exit(1);
});
