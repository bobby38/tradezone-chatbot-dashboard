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
  "football game": "FIFA EA Sports FC",
  soccer: "FIFA EA Sports FC",
  "any football": "FIFA EA Sports FC",
  "any soccer": "FIFA EA Sports FC",
  "any fifa": "FIFA EA Sports FC",
  "any fifa game": "FIFA EA Sports FC",
  "baseball": "MLB The Show",
  "baseball game": "MLB The Show",
  "boxing": "UFC Undisputed Fight Night Creed",
  "boxing game": "UFC Undisputed Fight Night Creed",
  "boxe": "UFC Undisputed Fight Night Creed",
  "boxe game": "UFC Undisputed Fight Night Creed",
  "ufc": "UFC Undisputed Fight Night Creed",
  "wrestling": "WWE 2K AEW Fight Forever",
  "wwe": "WWE 2K AEW Fight Forever",
  "fishing": "Bass Pro Shops Dredge Dave the Diver",
  "fishing game": "Bass Pro Shops Dredge Dave the Diver",
  "skateboard": "Tony Hawk Skate Riders Republic",
  "skateboarding": "Tony Hawk Skate Riders Republic",
  "skate game": "Tony Hawk Skate Riders Republic",
  "golf": "PGA Tour Mario Golf",
  "tennis": "TopSpin Matchpoint Mario Tennis",
  "f1": "F1 24 F1 23 Formula 1",
  "formula 1": "F1 24 F1 23 Formula 1",
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
  "shooting game": "Call of Duty Battlefield Overwatch Rainbow Six Doom Far Cry",
  "shooter": "Call of Duty Battlefield Overwatch Rainbow Six Doom Far Cry Destiny",
  "war game": "Call of Duty Battlefield",
  "adventure game": "Zelda Uncharted Horizon God of War Assassin's Creed",
  rpg: "Final Fantasy Elden Ring Persona Cyberpunk Witcher Dragon Dogma Pokemon",
  "role playing game": "Final Fantasy Elden Ring Persona Cyberpunk Witcher Dragon Dogma",
  "role-playing game": "Final Fantasy Elden Ring Persona Cyberpunk Witcher Dragon Dogma",
  "jrpg": "Persona Final Fantasy Dragon Quest Tales of",
  "mmorpg": "Final Fantasy XIV Elder Scrolls Online Destiny Diablo The Division",
  "mmo": "Final Fantasy XIV Elder Scrolls Online Destiny Diablo The Division",
  "metroidvania": "Hollow Knight Metroid Prince of Persia Ori",
  "roguelike": "Hades Dead Cells Returnal Cult of the Lamb",
  "looter shooter": "Destiny 2 Borderlands The Division Warframe",
  "fps": "Call of Duty Battlefield Doom Far Cry Overwatch",
  "first person shooter": "Call of Duty Battlefield Doom Far Cry Overwatch",
  "first-person shooter": "Call of Duty Battlefield Doom Far Cry Overwatch",
  "tps": "Gears of War The Division Uncharted Last of Us",
  "third person shooter": "Gears of War The Division Uncharted Last of Us",
  "third-person shooter": "Gears of War The Division Uncharted Last of Us",
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
