import { test, expect } from "@playwright/test";

const API_URL = "http://127.0.0.1:3001/api/chatkit/agent";
const API_KEY = process.env.CHATKIT_API_KEY || "";

test.describe("Today's Fixes - Comprehensive Test Suite", () => {

  // Helper function to send chat message
  async function sendMessage(message: string) {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      body: JSON.stringify({
        message,
        history: [],
      }),
    });

    const data = await response.json();
    return data.response || "";
  }

  test.describe("1. Product Pagination & Category Links", () => {

    test("pokemon games should show pagination with Nintendo category link", async () => {
      const response = await sendMessage("pokemon games");

      // Should show "Showing X of Y results"
      expect(response).toMatch(/Showing \d+ of \d+ results/i);

      // Should have Nintendo games category link
      expect(response).toMatch(/View all games on website/i);
      expect(response).toContain("tradezone.sg/product-category/nintendo");

      // Should NOT have plural error "gamess"
      expect(response).not.toContain("gamess");

      console.log("✅ Pokemon games pagination test passed");
    });

    test("cheap tablets should have correct tablet category link", async () => {
      const response = await sendMessage("cheap tablets");

      // Should mention tablets
      expect(response.toLowerCase()).toContain("tablet");

      // If showing pagination, should have correct tablet link
      if (response.includes("View all")) {
        expect(response).toContain("handphone-tablet/tablet");
      }

      console.log("✅ Tablet category link test passed");
    });

    test("ps5 games should show proper category link", async () => {
      const response = await sendMessage("ps5 games");

      // Should show products or pagination
      expect(response).toMatch(/Here's what we have|Showing \d+ of/i);

      // Should NOT have "gamess" error
      expect(response).not.toContain("gamess");

      console.log("✅ PS5 games category test passed");
    });
  });

  test.describe("2. Sports Game Detection (No Results)", () => {

    test("NBA/basketball queries should give helpful no-results message", async () => {
      const testQueries = ["NBA games", "basketball", "curry", "jordan"];

      for (const query of testQueries) {
        const response = await sendMessage(query);

        // Should mention we don't stock basketball games
        expect(response.toLowerCase()).toMatch(/don't.*stock.*basketball|basketball games/i);

        // Should NOT show random products like graphics cards
        expect(response).not.toContain("ZOTAC");
        expect(response).not.toContain("RTX");
        expect(response).not.toContain("SD Card");

        // Should suggest other options
        expect(response.toLowerCase()).toMatch(/console games|other.*titles|looking for/i);

        console.log(`✅ Basketball detection passed for: "${query}"`);
      }
    });

    test("car/racing game queries should give helpful message", async () => {
      const testQueries = ["car games", "racing games", "forza"];

      for (const query of testQueries) {
        const response = await sendMessage(query);

        // Should mention we don't stock racing/car games
        expect(response.toLowerCase()).toMatch(/don't.*stock.*(racing|car)|racing.*games/i);

        // Should NOT show graphics cards or SD cards
        expect(response).not.toContain("ZOTAC");
        expect(response).not.toContain("RTX");
        expect(response).not.toContain("Samsung EVO");

        console.log(`✅ Racing game detection passed for: "${query}"`);
      }
    });

    test("FIFA/soccer queries should give helpful message", async () => {
      const response = await sendMessage("fifa games");

      // Should mention we don't stock football/soccer games or provide alternatives
      expect(response.toLowerCase()).toMatch(/don't.*stock.*(football|soccer)|fifa|other.*titles/i);

      console.log("✅ FIFA/soccer detection passed");
    });

    test("skateboard/Tony Hawk queries should give helpful message", async () => {
      const response = await sendMessage("tony hawk games");

      // Should mention skateboarding or provide alternatives
      expect(response.toLowerCase()).toMatch(/don't.*stock.*skateboard|tony hawk|other.*titles/i);

      console.log("✅ Skateboarding detection passed");
    });
  });

  test.describe("3. Trade-In Negation Detection", () => {

    test("'not trading' should NOT trigger trade-in flow", async () => {
      const response = await sendMessage("not trading i want to know if you got any basketball game");

      // Should NOT trigger trade-in response
      expect(response).not.toMatch(/We currently trade only electronics/i);
      expect(response).not.toMatch(/trade.*in.*electronics/i);

      // Should treat as product search
      expect(response.toLowerCase()).toMatch(/don't.*stock|basketball|games|looking for/i);

      console.log("✅ 'not trading' negation test passed");
    });

    test("'don't want to trade' should NOT trigger trade-in flow", async () => {
      const response = await sendMessage("I don't want to trade, just looking for games");

      // Should NOT trigger trade-in
      expect(response).not.toMatch(/We currently trade only/i);
      expect(response).not.toMatch(/trade.*in.*quote/i);

      console.log("✅ 'don't want to trade' negation test passed");
    });

    test("'just want to buy' should NOT trigger trade-in flow", async () => {
      const response = await sendMessage("no trade, just want to buy games");

      // Should NOT trigger trade-in
      expect(response).not.toMatch(/We currently trade only/i);

      console.log("✅ 'just want to buy' negation test passed");
    });

    test("'just want to see' should NOT trigger trade-in flow", async () => {
      const response = await sendMessage("just want to see what games you have");

      // Should NOT trigger trade-in
      expect(response).not.toMatch(/We currently trade only/i);

      // Should show products or ask clarifying questions
      expect(response.toLowerCase()).toMatch(/games|what.*looking|which.*platform/i);

      console.log("✅ 'just want to see' negation test passed");
    });
  });

  test.describe("4. Trade-In Queries Still Work", () => {

    test("'trade in my ps5' should trigger trade-in flow", async () => {
      const response = await sendMessage("trade in my ps5");

      // Should trigger trade-in flow
      expect(response.toLowerCase()).toMatch(/model|condition|disc|digital|trade.*in|price|worth|quote/i);

      console.log("✅ Trade-in trigger test passed");
    });

    test("'how much for my xbox' should trigger trade-in flow", async () => {
      const response = await sendMessage("how much for my xbox");

      // Should trigger trade-in flow
      expect(response.toLowerCase()).toMatch(/model|condition|series|trade.*in|price|worth/i);

      console.log("✅ 'how much for my' trade-in test passed");
    });

    test("'sell my switch' should trigger trade-in flow", async () => {
      const response = await sendMessage("sell my switch");

      // Should trigger trade-in flow
      expect(response.toLowerCase()).toMatch(/model|condition|trade.*in|price|worth|oled|v2/i);

      console.log("✅ 'sell my' trade-in test passed");
    });
  });

  test.describe("5. Product Format Consistency", () => {

    test("product listings should have consistent format", async () => {
      const testQueries = ["cheap tablets", "vr headsets", "steam deck"];

      for (const query of testQueries) {
        const response = await sendMessage(query);

        // Should have numbered list format if products found
        if (response.includes("Here's what we have") || response.includes("S$")) {
          // Should have numbered items
          expect(response).toMatch(/\d+\.\s+\*\*/);

          // Should have View Product links
          expect(response).toContain("View Product");

          // Should have SGD prices
          expect(response).toMatch(/S\$\d+/);
        }

        console.log(`✅ Format consistency passed for: "${query}"`);
      }
    });

    test("first product should have image, others should not", async () => {
      const response = await sendMessage("pokemon games");

      if (response.includes("S$")) {
        // Count image markdown instances: ![...]
        const imageMatches = response.match(/!\[.*?\]\(.*?\)/g);

        if (imageMatches) {
          // Should have exactly 1 image (first product only)
          expect(imageMatches.length).toBe(1);
          console.log("✅ Image count test passed - exactly 1 image");
        } else {
          console.log("⚠️  No images found in response");
        }
      }
    });
  });

  test.describe("6. Edge Cases", () => {

    test("typo 'baseketball' should still detect basketball", async () => {
      const response = await sendMessage("baseketball");

      // Should recognize as basketball despite typo
      expect(response.toLowerCase()).toMatch(/basketball|don't.*stock.*sport|other.*titles/i);

      console.log("✅ Typo tolerance test passed");
    });

    test("'nba 2k' should trigger basketball detection", async () => {
      const response = await sendMessage("nba 2k");

      // Should detect as basketball game
      expect(response.toLowerCase()).toMatch(/basketball|don't.*stock|other.*titles/i);

      console.log("✅ NBA 2K detection test passed");
    });

    test("phones with budget should show phone products", async () => {
      const response = await sendMessage("cheap phones under $200");

      // Should show phones or phone-related response
      expect(response.toLowerCase()).toMatch(/phone|handphone|iphone|samsung|galaxy/i);

      // If showing category link, should have correct phone URL
      if (response.includes("View all")) {
        expect(response).toContain("handphone-tablet/handphone");
      }

      console.log("✅ Phone budget search test passed");
    });
  });

  test.describe("7. General Product Search Sanity Check", () => {

    test("common product queries should return relevant results", async () => {
      const testCases = [
        { query: "playstation 5", shouldContain: ["ps5", "playstation"] },
        { query: "nintendo switch", shouldContain: ["switch", "nintendo"] },
        { query: "steam deck", shouldContain: ["steam", "deck"] },
      ];

      for (const { query, shouldContain } of testCases) {
        const response = await sendMessage(query);
        const lowerResponse = response.toLowerCase();

        // Should contain at least one of the expected terms
        const hasRelevantContent = shouldContain.some(term =>
          lowerResponse.includes(term.toLowerCase())
        );

        expect(hasRelevantContent).toBe(true);
        console.log(`✅ Sanity check passed for: "${query}"`);
      }
    });
  });
});
