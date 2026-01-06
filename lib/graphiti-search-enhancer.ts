/**
 * Graphiti-powered search enhancement
 * Uses Graph RAG to expand user queries with synonyms and redirects
 */

import { queryGraphitiContext } from "@/lib/graphiti";
import { getSemanticSynonymMap } from "@/lib/graphiti-taxonomy";

export interface SearchEnhancement {
  originalQuery: string;
  enhancedQuery: string;
  redirect?: string;
  confidence: number;
  source: "graphiti" | "hardcoded" | "none";
}

const TAXONOMY_SYNONYMS = getSemanticSynonymMap();

// Hardcoded fallback synonyms (immediate fix while Graphiti processes)
const STATIC_SYNONYMS: Record<string, string> = {
  basketball: "NBA 2K",
  "any basketball": "NBA 2K",
  "any basketball game": "NBA 2K",
  football: "FIFA EA Sports FC",
  soccer: "FIFA EA Sports FC",
  "any football": "FIFA EA Sports FC",
  "any soccer": "FIFA EA Sports FC",
  "any fifa": "FIFA EA Sports FC",
  "any fifa game": "FIFA EA Sports FC",
  "horror game": "Resident Evil Silent Hill Until Dawn Alan Wake Dead Space Dying Light Last of Us Friday the 13th The Evil Within",
  "scary game": "Resident Evil Silent Hill Until Dawn Alan Wake Dead Space Dying Light Last of Us Friday the 13th",
  "any horror": "Resident Evil Silent Hill Until Dawn Alan Wake Dead Space Dying Light Last of Us Friday the 13th",
  "any horror game": "Resident Evil Silent Hill Until Dawn Alan Wake Dead Space Dying Light Last of Us Friday the 13th",
  "horror": "Resident Evil Silent Hill Until Dawn Alan Wake Dead Space Dying Light Last of Us Friday the 13th",
  "car game": "racing games Gran Turismo Forza",
  "racing game": "Gran Turismo Forza Need for Speed",
  pokemon: "Pokemon Scarlet Violet Legends",
  zelda: "Legend of Zelda Breath Wild Tears Kingdom",
  mario: "Super Mario Wonder Odyssey Kart",
  "shooting game": "Call of Duty Battlefield FPS",
  "war game": "Call of Duty Battlefield",
  "adventure game": "Zelda Uncharted Horizon",
  rpg: "Final Fantasy Elden Ring Pokemon",
  "role playing game": "Final Fantasy Dragon Quest Persona",
  "role-playing game": "Final Fantasy Dragon Quest Persona",
  "jrpg": "Persona Final Fantasy Dragon Quest",
  "mmorpg": "Final Fantasy XIV Elder Scrolls Online",
  "mmo": "Final Fantasy XIV Elder Scrolls Online",
  "metroidvania": "Hollow Knight Metroid Dread Ori",
  "roguelike": "Hades Dead Cells Slay the Spire",
  "looter shooter": "Destiny 2 Borderlands Warframe",
  "fps": "Call of Duty Battlefield Halo",
  "first person shooter": "Call of Duty Battlefield Halo",
  "first-person shooter": "Call of Duty Battlefield Halo",
  "tps": "Gears of War The Division",
  "third person shooter": "The Division Gears of War",
  "third-person shooter": "The Division Gears of War",
  "cheap tablet": "Samsung Galaxy Tab A",
  "affordable phone": "Samsung Galaxy A series",
  "budget console": "PS4 Xbox Series S",
  "best handheld": "Steam Deck ROG Ally",
  "vr headset": "PlayStation VR2 Meta Quest",
  "wireless controller": "DualSense Xbox controller",
};

const HARDCODED_SYNONYMS: Record<string, string> = {
  ...TAXONOMY_SYNONYMS,
  ...STATIC_SYNONYMS,
};

/**
 * Enhance search query using Graphiti Graph RAG
 * Falls back to hardcoded synonyms if Graphiti is unavailable
 */
export async function enhanceSearchQuery(
  query: string
): Promise<SearchEnhancement> {
  const normalized = query.toLowerCase().trim();

  // Try Graphiti first
  try {
    const graphResult = await queryGraphitiContext(
      `search synonym redirect for: ${query}`,
      {
        groupId: process.env.GRAPHTI_DEFAULT_GROUP_ID || "tradezone-main",
        maxFacts: 3,
      }
    );

    if (graphResult.facts && graphResult.facts.length > 0) {
      // Extract redirect from first fact
      const fact = graphResult.facts[0];
      const redirectMatch = fact.fact.match(/redirect them to:\s*([^.]+)/i);

      if (redirectMatch) {
        const redirect = redirectMatch[1].trim();
        console.log("[GraphitiSearchEnhancer] Found redirect", {
          query,
          redirect,
          fact: fact.fact,
        });

        return {
          originalQuery: query,
          enhancedQuery: redirect,
          redirect,
          confidence: 0.95,
          source: "graphiti",
        };
      }
    }
  } catch (error) {
    console.warn("[GraphitiSearchEnhancer] Graphiti unavailable", error);
  }

  // Fallback to hardcoded synonyms
  const hardcodedMatch = HARDCODED_SYNONYMS[normalized];
  if (hardcodedMatch) {
    console.log("[GraphitiSearchEnhancer] Using hardcoded synonym", {
      query,
      redirect: hardcodedMatch,
    });

    return {
      originalQuery: query,
      enhancedQuery: hardcodedMatch,
      redirect: hardcodedMatch,
      confidence: 1.0,
      source: "hardcoded",
    };
  }

  // No enhancement needed
  return {
    originalQuery: query,
    enhancedQuery: query,
    confidence: 1.0,
    source: "none",
  };
}

/**
 * Quick check if query needs enhancement (before expensive Graphiti call)
 */
export function shouldEnhanceQuery(query: string): boolean {
  const normalized = query.toLowerCase().trim();

  // Check hardcoded first (fast)
  if (HARDCODED_SYNONYMS[normalized]) {
    return true;
  }

  // Generic terms that likely need enhancement
  const genericPatterns = [
    /\b(basketball|football|soccer)\b/i,
    /\b(horror|scary|spooky)\s+(game|games)\b/i,
    /\b(car|racing)\s+(game|games)\b/i,
    /\b(cheap|affordable|budget)\s+(tablet|phone|console)\b/i,
    /\b(best|top)\s+(handheld|vr|headset)\b/i,
    /\bany\s+(game|games|horror|adventure|rpg)\b/i,
  ];

  return genericPatterns.some((pattern) => pattern.test(normalized));
}
