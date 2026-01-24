import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

type SynonymEntry = {
  query: string;
  redirect_to: string;
  category: string;
  platforms: string[];
  confidence: number;
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
const GRAPHITI_ROLE = "SearchSynonymSync";

const baseUrl = process.env.GRAPHTI_BASE_URL?.replace(/\/$/, "");
const apiKey = process.env.GRAPHTI_API_KEY;
const groupId = process.env.GRAPHTI_DEFAULT_GROUP_ID || "tradezone-main";

if (!baseUrl || !apiKey) {
  console.error(
    "❌ Set GRAPHTI_BASE_URL and GRAPHTI_API_KEY in your environment before running this sync."
  );
  process.exit(1);
}

function buildSynonymMessage(entry: SynonymEntry, index: number): GraphitiMessage {
  const platforms = entry.platforms.length > 0
    ? ` Available on: ${entry.platforms.join(", ")}.`
    : "";

  const content = `When a customer searches for "${entry.query}", redirect them to: ${entry.redirect_to}. Category: ${entry.category}.${platforms} Confidence: ${(entry.confidence * 100).toFixed(0)}%.`;

  return {
    uuid: crypto.randomUUID(),
    name: `search-synonym-${entry.query.replace(/\s+/g, "-")}`,
    role_type: "system",
    role: GRAPHITI_ROLE,
    content,
    timestamp: new Date().toISOString(),
    source_description: "search_synonym_mapping",
  };
}

async function loadSynonyms(): Promise<SynonymEntry[]> {
  const synonymPath = path.join(process.cwd(), "data", "catalog", "search_synonyms.jsonl");
  const raw = await fs.readFile(synonymPath, "utf8");

  return raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as SynonymEntry;
      } catch (error) {
        console.warn("⚠️ Failed to parse synonym line:", { line, error });
        return null;
      }
    })
    .filter((entry): entry is SynonymEntry => Boolean(entry));
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
      `Graphiti synonym sync failed for batch ${batchIndex}/${totalBatches}: ${response.status} ${response.statusText} ${body}`
    );
  }
  console.log(
    `✅ Uploaded batch ${batchIndex}/${totalBatches} (${messages.length} synonym mappings)`
  );
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const synonyms = await loadSynonyms();

  console.log(`\n🔍 Loaded ${synonyms.length} search synonym mappings\n`);

  const messages: GraphitiMessage[] = synonyms.map((entry, index) =>
    buildSynonymMessage(entry, index)
  );

  console.log(
    `📦 Prepared ${messages.length} messages for group ${groupId}\n`
  );

  if (dryRun) {
    console.log("🧪 DRY RUN - Sample message:");
    console.log(JSON.stringify(messages[0], null, 2));
    console.log("\n✅ Dry run complete. Use without --dry-run to upload to Graphiti.");
    return;
  }

  const batches = chunkMessages(messages, GRAPHITI_BATCH_SIZE);
  console.log(`🚀 Uploading ${batches.length} batches to Graphiti...\n`);

  for (let i = 0; i < batches.length; i += 1) {
    await uploadBatch(batches[i], i + 1, batches.length);
  }

  console.log("\n✅ Completed Graphiti search synonym sync!");
  console.log(`\n📊 Summary:`);
  console.log(`   - Total synonyms: ${synonyms.length}`);
  console.log(`   - Batches uploaded: ${batches.length}`);
  console.log(`   - Group ID: ${groupId}`);
  console.log(`\n🧪 Test with:`);
  console.log(`   curl -X POST "${baseUrl}/search" \\`);
  console.log(`     -H "x-api-key: ${apiKey?.substring(0, 6)}..." \\`);
  console.log(`     -H "Content-Type: application/json" \\`);
  console.log(`     -d '{"query": "basketball", "max_facts": 5, "group_ids": ["${groupId}"]}'`);
}

main().catch((error) => {
  console.error("\n❌ Synonym sync failed:", error);
  process.exit(1);
});
