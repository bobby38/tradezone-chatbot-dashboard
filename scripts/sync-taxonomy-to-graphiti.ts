import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const baseUrl = process.env.GRAPHTI_BASE_URL?.replace(/\/$/, "");
const apiKey = process.env.GRAPHTI_API_KEY;
const groupId = process.env.GRAPHTI_DEFAULT_GROUP_ID || "tradezone-main";

if (!baseUrl || !apiKey) {
  console.error("❌ Missing Graphiti environment variables");
  process.exit(1);
}

async function loadTaxonomy() {
  const taxonomyPath = path.join(
    process.cwd(),
    "data",
    "catalog",
    "taxonomy.json"
  );
  const raw = await fs.readFile(taxonomyPath, "utf8");
  return JSON.parse(raw);
}

function buildMessages(taxonomy: any) {
  const messages: any[] = [];
  taxonomy.taxonomy_nodes.forEach((node: any) => {
    const content = `Taxonomy Node ${node.node_id}: ${node.platform}. ${node.description}. Sub-categories: ${JSON.stringify(node.sub_categories)}`;
    messages.push({
      uuid: crypto.randomUUID(),
      name: `taxonomy-node-${node.node_id}`,
      role_type: "system",
      role: "TaxonomyNode",
      content,
      timestamp: new Date().toISOString(),
      source_description: "taxonomy_node",
    });
  });

  taxonomy.semantic_teams.forEach((team: any) => {
    const content = `Semantic Team ${team.team_id} (${team.core_label}): synonyms ${team.synonyms.join(", ")}, nods ${team.nods.join(", ")}, platforms ${team.associated_platforms.join(", ")}. Intent: ${team.search_intent}`;
    messages.push({
      uuid: crypto.randomUUID(),
      name: `semantic-team-${team.team_id}`,
      role_type: "system",
      role: "SemanticTeam",
      content,
      timestamp: new Date().toISOString(),
      source_description: "semantic_team",
    });
  });

  return messages;
}

async function uploadMessages(messages: any[]) {
  const chunks: any[][] = [];
  for (let i = 0; i < messages.length; i += 25) {
    chunks.push(messages.slice(i, i + 25));
  }

  for (let i = 0; i < chunks.length; i += 1) {
    const response = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey!,
      },
      body: JSON.stringify({
        group_id: groupId,
        messages: chunks[i],
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Failed to upload taxonomy chunk ${i + 1}/${chunks.length}: ${response.status} ${response.statusText} ${body}`
      );
    }
    console.log(
      `✅ Uploaded taxonomy chunk ${i + 1}/${chunks.length} (${chunks[i].length} messages)`
    );
  }
}

async function main() {
  try {
    const taxonomy = await loadTaxonomy();
    const messages = buildMessages(taxonomy);
    await uploadMessages(messages);
    console.log("\n✅ Graphiti taxonomy sync complete");
  } catch (error) {
    console.error("❌ Taxonomy sync failed", error);
    process.exit(1);
  }
}

main();
