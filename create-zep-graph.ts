import path from "node:path";
import dotenv from "dotenv";
import { ZepClient } from "@getzep/zep-cloud";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

async function main() {
  if (!process.env.ZEP_API_KEY) {
    throw new Error("Set ZEP_API_KEY in .env.local first");
  }

  const client = new ZepClient({ apiKey: process.env.ZEP_API_KEY });
  const graph = await client.graph.create({
    graphId: "tradezone-catalog", // change if you prefer another ID
    name: "TradeZone Catalog",
    description: "Normalized catalog + trade data",
  });

  console.log("Graph created:", graph.graph_id);
}

main().catch((err) => {
  console.error("[create-zep-graph] failed", err);
  process.exit(1);
});
