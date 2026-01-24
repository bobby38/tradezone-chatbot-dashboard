#!/usr/bin/env tsx
/**
 * Graphiti Learning Loop - Run weekly to improve chatbot intelligence
 *
 * This script:
 * 1. Analyzes failed searches from the past week
 * 2. Learns successful patterns from chat logs
 * 3. Generates new synonym mappings automatically
 * 4. Uploads learned patterns to Graphiti
 *
 * Run weekly via cron: 0 2 * * 0 (2am every Sunday)
 */

import dotenv from "dotenv";
import path from "path";
import {
  analyzeFailedSearches,
  learnFromChatLogs,
  applyLearnedPatterns,
} from "../lib/graphiti-learning-loop";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

async function main() {
  console.log("\n🧠 TradeZone Graphiti Learning Loop\n");
  console.log("=" .repeat(50));

  try {
    // Step 1: Learn from successful chat patterns
    console.log("\n📚 Step 1: Learning from successful chat logs...");
    await learnFromChatLogs();

    // Step 2: Analyze failed searches
    console.log("\n🔍 Step 2: Analyzing failed searches...");
    const patterns = await analyzeFailedSearches(100);

    if (patterns.length === 0) {
      console.log("✅ No failed search patterns found (good news!)");
    } else {
      console.log(`\n📊 Found ${patterns.length} potential improvements:`);
      patterns.slice(0, 10).forEach((p, idx) => {
        console.log(
          `   ${idx + 1}. "${p.originalQuery}" → "${p.suggestedRedirect}" (${(p.confidence * 100).toFixed(0)}% confidence)`
        );
      });

      // Step 3: Apply learned patterns to Graphiti
      console.log("\n⬆️  Step 3: Uploading learned patterns to Graphiti...");
      const applied = await applyLearnedPatterns(patterns);

      console.log(`\n✅ Applied ${applied} new synonym mappings`);
    }

    console.log("\n" + "=".repeat(50));
    console.log("🎉 Learning loop completed successfully!\n");

    console.log("📈 Next steps:");
    console.log("   1. Run 'npm run catalog:sync-graphiti' to sync product catalog");
    console.log("   2. Monitor dashboard for improved search quality");
    console.log("   3. Review auto-learned synonyms in Graphiti");

  } catch (error) {
    console.error("\n❌ Learning loop failed:", error);
    process.exit(1);
  }
}

main();
