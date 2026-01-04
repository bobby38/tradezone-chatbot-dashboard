import taxonomyData from "@/data/catalog/taxonomy.json";

export interface TaxonomyNode {
  node_id: string;
  platform: string;
  description: string;
  sub_categories: unknown;
}

export interface SemanticTeam {
  team_id: string;
  core_label: string;
  synonyms: string[];
  nods: string[];
  associated_platforms: string[];
  search_intent: string;
}

export interface TaxonomyPayload {
  store_metadata: {
    source: string;
    purpose: string;
    version: string;
    last_updated: string;
  };
  taxonomy_nodes: TaxonomyNode[];
  semantic_teams: SemanticTeam[];
}

const taxonomy = taxonomyData as TaxonomyPayload;

function buildSemanticSynonymMap(teams: SemanticTeam[]): Record<string, string> {
  const map: Record<string, string> = {};
  teams.forEach((team) => {
    const target = `${team.core_label} ${team.nods.join(" ")}`.trim();
    const entries = new Set<string>([
      team.core_label,
      ...team.synonyms,
      ...team.nods,
    ]);
    entries.forEach((entry) => {
      const key = entry.toLowerCase();
      if (!key) return;
      if (!map[key]) {
        map[key] = target;
      }
    });
  });
  return map;
}

const SEMANTIC_SYNONYM_MAP = buildSemanticSynonymMap(taxonomy.semantic_teams);

export function getTaxonomy(): TaxonomyPayload {
  return taxonomy;
}

export function getSemanticSynonymMap(): Record<string, string> {
  return SEMANTIC_SYNONYM_MAP;
}
