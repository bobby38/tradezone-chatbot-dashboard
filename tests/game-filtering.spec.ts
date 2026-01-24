import { test, expect } from "@playwright/test";

/**
 * Automated tests for game filtering functionality
 * Tests the fixes for:
 * - Category-based filtering (show only games, not accessories)
 * - Platform filter category extraction bug
 * - Brand new vs pre-owned game separation
 */

// Use n8n webhook for testing (no auth required) or skip auth in dev
const CHATKIT_URL =
  process.env.CHATKIT_TEST_URL || "http://localhost:3001/api/chatkit/agent";
const USE_N8N = process.env.USE_N8N_FOR_TESTS === "true";

async function sendChatMessage(query: string): Promise<any> {
  // Skip tests if server not running
  const sessionId = `test-${Date.now()}-${Math.random()}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Only add API key if not using n8n webhook
  if (!USE_N8N && process.env.CHATKIT_API_KEY) {
    headers["X-API-Key"] = process.env.CHATKIT_API_KEY;
  }

  const response = await fetch(CHATKIT_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      messages: [{ role: "user", content: query }],
      sessionId,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `API error: ${response.status} ${response.statusText}\n${errorBody}`,
    );
  }

  return response.json();
}

test.describe("Game Filtering Tests", () => {
  test("PS4 games - should show multiple games, not just 1", async () => {
    const response = await sendChatMessage("PS4 games");
    const text = response.response || "";

    // Should mention multiple products
    expect(text).toContain("products):");

    // Should NOT say "Showing all 1 results"
    expect(text).not.toContain("Showing all 1 results");

    // Should show brand new games hint
    expect(text).toContain("brand new games");
    expect(text).toContain("pre-owned");

    // Should include category link
    expect(text).toContain("tradezone.sg/product-category");
    expect(text).toContain("playstation-4");

    console.log(
      "✅ PS4 games returned:",
      text.match(/\d+(?= products)/)?.[0],
      "products",
    );
  });

  test("PS4 games - should exclude controllers and warranties", async () => {
    const response = await sendChatMessage("PS4 games");
    const text = response.response || "";

    // Should NOT include accessories
    expect(text.toLowerCase()).not.toContain("controller");
    expect(text.toLowerCase()).not.toContain("warranty");
    expect(text.toLowerCase()).not.toContain("dualshock");

    console.log("✅ No accessories in PS4 games results");
  });

  test("PS5 games - should show multiple games", async () => {
    const response = await sendChatMessage("PS5 games");
    const text = response.response || "";

    // Should show multiple products
    expect(text).toContain("products):");

    // Should show brand new games hint
    expect(text).toContain("brand new games");
    expect(text).toContain("pre-owned");

    console.log(
      "✅ PS5 games returned:",
      text.match(/\d+(?= products)/)?.[0],
      "products",
    );
  });

  test("Switch games - should show Nintendo games", async () => {
    const response = await sendChatMessage("Switch games");
    const text = response.response || "";

    // Should show games
    expect(text).toContain("products):");

    // Should include Nintendo/Switch category link
    expect(text).toContain("tradezone.sg/product-category");
    expect(text.toLowerCase()).toMatch(/nintendo|switch/);

    console.log(
      "✅ Switch games returned:",
      text.match(/\d+(?= products)/)?.[0],
      "products",
    );
  });

  test("Pre-owned PS4 games - should show pre-owned only", async () => {
    const response = await sendChatMessage("pre-owned PS4 games");
    const text = response.response || "";

    // Should show pre-owned games
    expect(text).toContain("products):");

    // Should link to pre-owned category
    expect(text).toContain("pre-owned-games");

    // Should NOT show brand new hint (already showing pre-owned)
    expect(text).not.toContain("These are brand new games");

    console.log("✅ Pre-owned PS4 games test passed");
  });

  test("Used PS4 games - should show pre-owned games", async () => {
    const response = await sendChatMessage("used PS4 games");
    const text = response.response || "";

    // Should show pre-owned games
    expect(text).toContain("products):");

    // Should link to pre-owned category
    expect(text).toContain("pre-owned-games");

    console.log("✅ Used PS4 games (pre-owned) test passed");
  });

  test("PS4 games should include games without PS4 in name", async () => {
    const response = await sendChatMessage("PS4 games");
    const text = response.response || "";

    // These are example PS4 games that don't have "PS4" in their names
    // At least some of these should appear
    const gamesWithoutPS4InName = [
      "Rock Band",
      "Star Wars",
      "Borderlands",
      "Final Fantasy",
      "Destiny",
      "Burnout",
    ];

    const foundGames = gamesWithoutPS4InName.filter((game) =>
      text.includes(game),
    );

    // Should find at least one game without PS4 in the name
    expect(foundGames.length).toBeGreaterThan(0);

    console.log("✅ Found games without PS4 in name:", foundGames.join(", "));
  });

  test("Brand new vs pre-owned separation", async () => {
    const brandNewResponse = await sendChatMessage("PS4 games");
    const brandNewText = brandNewResponse.response || "";

    const preOwnedResponse = await sendChatMessage("pre-owned PS4 games");
    const preOwnedText = preOwnedResponse.response || "";

    // Brand new should have hint about pre-owned
    expect(brandNewText).toContain("brand new games");
    expect(brandNewText).toContain("Want to see pre-owned");

    // Pre-owned should link to pre-owned category
    expect(preOwnedText).toContain("pre-owned-games");

    // Results should be different
    expect(brandNewText).not.toEqual(preOwnedText);

    console.log("✅ Brand new and pre-owned are properly separated");
  });

  test("Xbox games - should show Xbox games", async () => {
    const response = await sendChatMessage("Xbox games");
    const text = response.response || "";

    // Should show games
    expect(text).toContain("products):");

    // Should include Xbox category link
    expect(text).toContain("tradezone.sg/product-category");
    expect(text.toLowerCase()).toContain("xbox");

    console.log(
      "✅ Xbox games returned:",
      text.match(/\d+(?= products)/)?.[0],
      "products",
    );
  });

  test("Show more functionality with games", async () => {
    const response = await sendChatMessage("PS4 games");
    const text = response.response || "";

    // If there are more than 15 results, should show pagination
    const productCount = parseInt(text.match(/\d+(?= products)/)?.[0] || "0");

    if (productCount > 15) {
      expect(text).toContain("show more");
      console.log("✅ Pagination shown for", productCount, "products");
    } else if (productCount > 0) {
      expect(text).toContain("Showing all");
      console.log(
        "✅ Showing all",
        productCount,
        "products (no pagination needed)",
      );
    }
  });
});

test.describe("Category Extraction Bug Fix Validation", () => {
  test("Categories should be extracted as names, not [object Object]", async () => {
    const response = await sendChatMessage("PS4 games");
    const text = response.response || "";

    // Should NOT contain [object Object] anywhere
    expect(text).not.toContain("[object Object]");
    expect(text).not.toContain("object Object");

    console.log("✅ No [object Object] in response");
  });

  test("Platform filter should match category names correctly", async () => {
    // This test validates the fix for:
    // const cats = categories.join(' ') → '[object Object]'
    // vs
    // const cats = categories.map(c => c.name).join(' ') → 'Playstation 4'

    const response = await sendChatMessage("PS4 games");
    const text = response.response || "";

    // Should have found games by matching category names
    const productCount = parseInt(text.match(/\d+(?= products)/)?.[0] || "0");

    // Should have multiple results (not just 1 which was the bug)
    expect(productCount).toBeGreaterThan(1);

    console.log(
      "✅ Platform filter matched",
      productCount,
      "games via category names",
    );
  });
});
