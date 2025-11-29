/**
 * Test script for product search hallucination fixes
 * Run with: npx ts-node scripts/test-product-search.ts
 */

const TEST_QUERIES = [
  {
    query: "cheap handphone",
    shouldContain: ["iPhone", "Galaxy", "Oppo", "Pixel"],
    shouldNotContain: ["Anthem", "Hades", "🔴 MANDATORY", "DO NOT SHOW TO USER", "CRITICAL RULES"],
    description: "Cheap phone search should show real phones, not hallucinated products or internal instructions"
  },
  {
    query: "galaxy tab or ipad",
    shouldContain: ["Galaxy Tab", "iPad"],
    shouldNotContain: ["Guardians of the Galaxy", "🔴 MANDATORY", "DO NOT SHOW TO USER"],
    description: "Tablet search should show both Galaxy Tab and iPad products"
  },
  {
    query: "samsung galaxy tab",
    shouldContain: ["Galaxy Tab A9"],
    shouldNotContain: ["Galaxy Z Fold", "Guardians of the Galaxy", "🔴 MANDATORY"],
    description: "Galaxy Tab search should prioritize tablets over phones or games"
  },
  {
    query: "poster",
    shouldContain: [],
    shouldNotContain: ["Pokemon", "Zelda", "poster"],
    description: "Poster search should not hallucinate products that don't exist (404s)"
  }
];

async function testProductSearch() {
  console.log("🧪 Testing Product Search Anti-Hallucination Fixes\n");
  
  const API_URL = process.env.API_URL || "http://localhost:3000/api/chatkit/agent";
  const API_KEY = process.env.X_API_KEY || "test-key";
  
  let passed = 0;
  let failed = 0;
  
  for (const test of TEST_QUERIES) {
    console.log(`\n📝 Test: ${test.description}`);
    console.log(`   Query: "${test.query}"`);
    
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY
        },
        body: JSON.stringify({
          message: test.query,
          sessionId: `test-${Date.now()}`
        })
      });
      
      if (!response.ok) {
        console.log(`   ❌ FAIL: API returned ${response.status}`);
        failed++;
        continue;
      }
      
      const data = await response.json();
      const responseText = data.response || "";
      
      let testPassed = true;
      
      // Check shouldContain
      for (const phrase of test.shouldContain) {
        if (!responseText.includes(phrase)) {
          console.log(`   ❌ FAIL: Response should contain "${phrase}"`);
          testPassed = false;
        }
      }
      
      // Check shouldNotContain
      for (const phrase of test.shouldNotContain) {
        if (responseText.includes(phrase)) {
          console.log(`   ❌ FAIL: Response should NOT contain "${phrase}"`);
          console.log(`   Found in: ${responseText.substring(0, 200)}...`);
          testPassed = false;
        }
      }
      
      if (testPassed) {
        console.log(`   ✅ PASS`);
        passed++;
      } else {
        failed++;
      }
      
    } catch (error) {
      console.log(`   ❌ FAIL: ${error.message}`);
      failed++;
    }
  }
  
  console.log(`\n\n📊 Results: ${passed} passed, ${failed} failed out of ${TEST_QUERIES.length} tests`);
  process.exit(failed > 0 ? 1 : 0);
}

testProductSearch();
