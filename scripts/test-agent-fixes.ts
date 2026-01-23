/**
 * Test script for agent fixes (Jan 23, 2026)
 * Tests: Game trade-in, warranty policy, support flow, PS5 console trade-in
 * Run with: npx ts-node scripts/test-agent-fixes.ts
 */

const TEST_CASES = [
  {
    name: "Game trade-in (ps5 games)",
    message: "trade in ps5 games",
    shouldContain: ["game", "S$5", "S$40"],
    shouldNotContain: ["S$250", "S$700", "Fat/Slim/Pro"],
    description: "Should give game price range, NOT console price range",
  },
  {
    name: "Warranty policy question",
    message: "is your warranty for preowned 1 year or 1 month",
    shouldContain: ["7-day", "warranty"],
    shouldNotContain: ["Are you in Singapore"],
    description: "Should answer warranty policy, NOT start support flow",
  },
  {
    name: "PS5 console trade-in",
    message: "trade in ps5",
    shouldContain: ["S$250", "Fat/Slim/Pro", "Digital/Disc"],
    shouldNotContain: ["game"],
    description: "Should give console price range with model question",
  },
  {
    name: "Product search (switch games)",
    message: "any switch games",
    shouldContain: ["Nintendo", "Switch"],
    shouldNotContain: ["Are you in Singapore", "trade-in"],
    description: "Should show Switch games, not trigger trade-in flow",
  },
];

async function runTests() {
  console.log("🧪 Testing Agent Fixes (Jan 23, 2026)\n");
  console.log("=".repeat(60) + "\n");

  const API_URL = process.env.API_URL || "http://localhost:3001/api/chatkit/agent";
  const API_KEY = process.env.CHATKIT_API_KEY || "tzck_mfuWZAo12CkCi9-AMQOSZAvLW7cDJaUB";

  let passed = 0;
  let failed = 0;

  for (const test of TEST_CASES) {
    console.log(`📝 Test: ${test.name}`);
    console.log(`   Input: "${test.message}"`);
    console.log(`   Expected: ${test.description}`);

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
        },
        body: JSON.stringify({
          message: test.message,
          sessionId: `test-fix-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        }),
      });

      if (!response.ok) {
        console.log(`   ❌ FAIL: API returned ${response.status}`);
        const errorText = await response.text();
        console.log(`   Error: ${errorText.substring(0, 200)}`);
        failed++;
        console.log("\n" + "-".repeat(60) + "\n");
        continue;
      }

      const data = await response.json();
      const reply = data.reply || data.response || "";

      console.log(`   Reply: ${reply.substring(0, 250)}${reply.length > 250 ? "..." : ""}`);

      let testPassed = true;

      // Check shouldContain
      for (const phrase of test.shouldContain) {
        if (!reply.toLowerCase().includes(phrase.toLowerCase())) {
          console.log(`   ❌ Missing: "${phrase}"`);
          testPassed = false;
        }
      }

      // Check shouldNotContain
      for (const phrase of test.shouldNotContain) {
        if (reply.toLowerCase().includes(phrase.toLowerCase())) {
          console.log(`   ❌ Unexpected: "${phrase}"`);
          testPassed = false;
        }
      }

      if (testPassed) {
        console.log(`   ✅ PASS`);
        passed++;
      } else {
        console.log(`   ❌ FAIL`);
        failed++;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`   ❌ ERROR: ${errorMessage}`);
      failed++;
    }

    console.log("\n" + "-".repeat(60) + "\n");

    // Small delay between tests
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log("=".repeat(60));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${TEST_CASES.length} tests\n`);

  if (failed === 0) {
    console.log("✅ All tests passed!\n");
  } else {
    console.log("❌ Some tests failed. Please review.\n");
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
