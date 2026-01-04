/**
 * Graphiti Learning Loop - Make the chatbot smarter from failures
 *
 * This module automatically learns from:
 * 1. Failed product searches (no results found)
 * 2. Repeated customer queries (high volume = important)
 * 3. Manual corrections from staff
 *
 * The learning loop feeds back into Graphiti to improve future searches.
 */

import { queryGraphitiContext } from "@/lib/graphiti";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface FailedSearch {
  query: string;
  timestamp: string;
  sessionId: string;
  frequency: number;
}

export interface LearnedPattern {
  originalQuery: string;
  suggestedRedirect: string;
  confidence: number;
  evidence: string[];
}

/**
 * Log a failed search to learn from later
 */
export async function logFailedSearch(
  query: string,
  sessionId: string,
  reason: "no_results" | "low_confidence" | "user_clarification_needed"
): Promise<void> {
  try {
    console.log("[GraphitiLearning] Logging failed search", {
      query,
      sessionId,
      reason,
    });

    // Store in Supabase for analysis
    await supabase.from("failed_searches").insert({
      query: query.toLowerCase().trim(),
      session_id: sessionId,
      reason,
      timestamp: new Date().toISOString(),
    });

    // Also log to Graphiti knowledge graph for future reference
    const baseUrl = process.env.GRAPHTI_BASE_URL?.replace(/\/$/, "");
    const apiKey = process.env.GRAPHTI_API_KEY;
    const groupId = process.env.GRAPHTI_DEFAULT_GROUP_ID || "tradezone-main";

    if (baseUrl && apiKey) {
      await fetch(`${baseUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          group_id: groupId,
          messages: [
            {
              uuid: crypto.randomUUID(),
              name: `failed-search-${Date.now()}`,
              role_type: "system",
              role: "FailedSearchLogger",
              content: `Customer searched for "${query}" but found no relevant results. Reason: ${reason}. Session: ${sessionId}. Timestamp: ${new Date().toISOString()}.`,
              timestamp: new Date().toISOString(),
              source_description: "failed_search_log",
            },
          ],
        }),
      });
    }
  } catch (error) {
    console.warn("[GraphitiLearning] Failed to log search failure", error);
  }
}

/**
 * Analyze failed searches and suggest new synonym mappings
 */
export async function analyzeFailedSearches(
  limit = 50
): Promise<LearnedPattern[]> {
  try {
    // Get most frequent failed searches from last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: failures, error } = await supabase
      .from("failed_searches")
      .select("query, reason, timestamp")
      .gte("timestamp", sevenDaysAgo)
      .order("timestamp", { ascending: false })
      .limit(limit);

    if (error) throw error;

    // Count frequency of each failed query
    const frequencyMap = new Map<string, number>();
    failures?.forEach((failure) => {
      const count = frequencyMap.get(failure.query) || 0;
      frequencyMap.set(failure.query, count + 1);
    });

    // Sort by frequency (most common failures first)
    const sortedFailures = Array.from(frequencyMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20); // Top 20 failures

    console.log("[GraphitiLearning] Top failed searches:", {
      total: failures?.length || 0,
      unique: sortedFailures.length,
      topFailures: sortedFailures.slice(0, 5),
    });

    // For each failed query, ask Graphiti what it SHOULD redirect to
    const patterns: LearnedPattern[] = [];

    for (const [query, frequency] of sortedFailures) {
      if (frequency < 2) continue; // Ignore one-off failures

      // Query Graphiti for similar successful searches
      const graphResult = await queryGraphitiContext(
        `What product category or brand does "${query}" refer to? Similar searches: basketball → NBA 2K, horror game → Silent Hill`,
        {
          groupId: process.env.GRAPHTI_DEFAULT_GROUP_ID || "tradezone-main",
          maxFacts: 5,
        }
      );

      if (graphResult.facts && graphResult.facts.length > 0) {
        // Extract suggested redirect from facts
        const suggestedRedirect = graphResult.facts
          .map((f) => f.fact)
          .join(" ")
          .match(/→\s*([A-Za-z0-9\s]+)/)?.[1] || "";

        if (suggestedRedirect) {
          patterns.push({
            originalQuery: query,
            suggestedRedirect: suggestedRedirect.trim(),
            confidence: Math.min(frequency / 10, 0.9), // More frequent = higher confidence
            evidence: graphResult.facts.map((f) => f.fact),
          });
        }
      }
    }

    return patterns;
  } catch (error) {
    console.error("[GraphitiLearning] Failed to analyze search failures", error);
    return [];
  }
}

/**
 * Learn from chat logs - find patterns in successful conversations
 */
export async function learnFromChatLogs(): Promise<void> {
  try {
    console.log("[GraphitiLearning] 🧠 Analyzing chat logs for patterns...");

    // Get recent successful conversations (user got product results)
    const { data: chats, error } = await supabase
      .from("chat_logs")
      .select("user_query, ai_response, session_id, created_at")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .ilike("ai_response", "%Here's what we have%") // Successful product search
      .limit(100);

    if (error) throw error;

    console.log(`[GraphitiLearning] Found ${chats?.length || 0} successful searches`);

    // Extract query → product mappings
    const baseUrl = process.env.GRAPHTI_BASE_URL?.replace(/\/$/, "");
    const apiKey = process.env.GRAPHTI_API_KEY;
    const groupId = process.env.GRAPHTI_DEFAULT_GROUP_ID || "tradezone-main";

    if (!baseUrl || !apiKey || !chats) return;

    const messages = chats
      .filter((chat) => {
        // Only learn from clear product mentions
        const hasProduct =
          /\*\*([A-Z][A-Za-z0-9\s\-]+)\*\*/g.test(chat.ai_response);
        return hasProduct;
      })
      .slice(0, 20) // Don't overwhelm Graphiti
      .map((chat) => {
        // Extract product names from markdown bold text
        const products = Array.from(
          chat.ai_response.matchAll(/\*\*([A-Z][A-Za-z0-9\s\-]+)\*\*/g)
        ).map((m) => m[1]);

        const content = `Customer query: "${chat.user_query}" successfully matched products: ${products.join(", ")}. This is a successful search pattern to remember.`;

        return {
          uuid: crypto.randomUUID(),
          name: `successful-search-${chat.session_id}`,
          role_type: "system" as const,
          role: "SuccessfulSearchLogger",
          content,
          timestamp: chat.created_at,
          source_description: "successful_search_pattern",
        };
      });

    if (messages.length > 0) {
      await fetch(`${baseUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          group_id: groupId,
          messages,
        }),
      });

      console.log(
        `[GraphitiLearning] ✅ Logged ${messages.length} successful search patterns to Graphiti`
      );
    }
  } catch (error) {
    console.error("[GraphitiLearning] Failed to learn from chat logs", error);
  }
}

/**
 * Apply learned patterns as new synonyms
 */
export async function applyLearnedPatterns(
  patterns: LearnedPattern[]
): Promise<number> {
  if (patterns.length === 0) return 0;

  console.log(
    `[GraphitiLearning] Applying ${patterns.length} learned patterns...`
  );

  const baseUrl = process.env.GRAPHTI_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.GRAPHTI_API_KEY;
  const groupId = process.env.GRAPHTI_DEFAULT_GROUP_ID || "tradezone-main";

  if (!baseUrl || !apiKey) {
    console.warn("[GraphitiLearning] Graphiti not configured");
    return 0;
  }

  const messages = patterns
    .filter((p) => p.confidence >= 0.5) // Only apply high-confidence patterns
    .map((pattern) => ({
      uuid: crypto.randomUUID(),
      name: `learned-synonym-${pattern.originalQuery.replace(/\s+/g, "-")}`,
      role_type: "system" as const,
      role: "LearnedSynonymMapper",
      content: `AUTO-LEARNED: When customer searches for "${pattern.originalQuery}", redirect them to: ${pattern.suggestedRedirect}. Confidence: ${(pattern.confidence * 100).toFixed(0)}%. Evidence: ${pattern.evidence.join("; ")}`,
      timestamp: new Date().toISOString(),
      source_description: "auto_learned_synonym",
    }));

  if (messages.length === 0) return 0;

  try {
    await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        group_id: groupId,
        messages,
      }),
    });

    console.log(
      `[GraphitiLearning] ✅ Applied ${messages.length} learned patterns to Graphiti`
    );
    return messages.length;
  } catch (error) {
    console.error("[GraphitiLearning] Failed to apply patterns", error);
    return 0;
  }
}
