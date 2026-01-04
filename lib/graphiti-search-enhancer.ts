/**
 * Graphiti-powered search enhancement
 * Uses Graph RAG to expand user queries with synonyms and redirects
 */

import { queryGraphitiContext } from "@/lib/graphiti";

export interface SearchEnhancement {
  originalQuery: string;
  enhancedQuery: string;
  redirect?: string;
  confidence: number;
  source: "graphiti" | "hardcoded" | "none";
}

// Hardcoded fallback synonyms (immediate fix while Graphiti processes)
const HARDCODED_SYNONYMS: Record<string, string> = {
  basketball: "NBA 2K",
  football: "FIFA EA Sports FC",
  soccer: "FIFA EA Sports FC",
  "horror game": "Silent Hill Resident Evil",
  "scary game": "horror games Silent Hill Resident Evil",
  "car game": "racing games Gran Turismo Forza",
  "racing game": "Gran Turismo Forza Need for Speed",
  pokemon: "Pokemon Scarlet Violet Legends",
  zelda: "Legend of Zelda Breath Wild Tears Kingdom",
  mario: "Super Mario Wonder Odyssey Kart",
  "shooting game": "Call of Duty Battlefield FPS",
  "war game": "Call of Duty Battlefield",
  "adventure game": "Zelda Uncharted Horizon",
  rpg: "Final Fantasy Elden Ring Pokemon",
  "cheap tablet": "Samsung Galaxy Tab A",
  "affordable phone": "Samsung Galaxy A series",
  "budget console": "PS4 Xbox Series S",
  "best handheld": "Steam Deck ROG Ally",
  "vr headset": "PlayStation VR2 Meta Quest",
  "wireless controller": "DualSense Xbox controller",
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
