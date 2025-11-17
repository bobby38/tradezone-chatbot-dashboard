import path from "node:path";
import dotenv from "dotenv";
import { ZepClient } from "@getzep/zep-cloud";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

async function main() {
  const apiKey = process.env.ZEP_API_KEY;
  if (!apiKey) {
    throw new Error("Set ZEP_API_KEY in .env.local before running.");
  }

  const graphId = process.env.ZEP_CATALOG_GRAPH_ID || "tradezone-catalog";

  const client = new ZepClient({ apiKey });
  const graph = await client.graph.create({
    graphId,
    name: "TradeZone Catalog",
    description: "Normalized products + trade grid used by the chatbot.",
  });

  const resolvedGraphId = graph.graphId ?? graph.graph_id ?? graphId;

  console.log("✅ Graph ready:", resolvedGraphId);
  console.log(
    "Add this to your .env.local:",
    `ZEP_CATALOG_GRAPH_ID=${resolvedGraphId}`,
  );
}

main().catch((error) => {
  console.error("[create-zep-graph] Failed to create graph", error);
  process.exit(1);
});
