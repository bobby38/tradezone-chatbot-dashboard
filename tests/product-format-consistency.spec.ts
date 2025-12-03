/**
 * Product Format Consistency Tests
 * Tests that product responses always have consistent format:
 * - First product has image
 * - All products have price
 * - All products have link
 *
 * User Requirements:
 * - "Make sure the product structure is: the main one is a picture, and after you get all the items, the price and the link. Always the same answer. Sometimes it's not consistent."
 * - "Image don't always add all the images necessarily, but I think the first one should have, the main one should have, image"
 */

import { test, expect } from "@playwright/test";

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3001";
const API_KEY = process.env.CHATKIT_API_KEY || "test-key";

test.describe("Product Format Consistency Tests", () => {
  test("First product should always have image", async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      data: {
        sessionId: `test-format-image-${Date.now()}`,
        message: "ps5 games",
        history: [],
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    expect(data.response).toBeDefined();
    const responseText = data.response;

    // Check for markdown image syntax: ![name](url)
    const hasImage = /!\[.*?\]\(.*?\)/.test(responseText);

    expect(hasImage).toBeTruthy();

    // Extract product list items (numbered 1., 2., etc.)
    const productItems = responseText.match(/^\d+\.\s+\*\*.*$/gm);

    if (productItems && productItems.length > 0) {
      // First product section should contain an image
      const firstProductSection = responseText.substring(
        0,
        productItems.length > 1
          ? responseText.indexOf(productItems[1])
          : responseText.length
      );

      const firstProductHasImage = /!\[.*?\]\(.*?\)/.test(firstProductSection);
      expect(firstProductHasImage).toBeTruthy();
    }
  });

  test("All products should have price in SGD format", async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      data: {
        sessionId: `test-format-price-${Date.now()}`,
        message: "xbox games",
        history: [],
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    const responseText = data.response;

    // Extract product items
    const productItems = responseText.match(/^\d+\.\s+\*\*.*$/gm);

    if (productItems && productItems.length > 0) {
      // Each product should have SGD price format: S$XX.XX
      productItems.forEach((item, idx) => {
        const hasPrice = /S\$\d+(\.\d{2})?/.test(item);
        expect(hasPrice).toBeTruthy();
      });
    }
  });

  test("All products should have View Product link", async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      data: {
        sessionId: `test-format-link-${Date.now()}`,
        message: "switch games",
        history: [],
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    const responseText = data.response;

    // Extract product items
    const productItems = responseText.match(/^\d+\.\s+\*\*.*$/gm);

    if (productItems && productItems.length > 0) {
      // Each product section should have [View Product] link
      // Split response into sections by product number
      const sections = responseText.split(/^\d+\.\s+/gm).filter((s) => s.trim());

      sections.forEach((section, idx) => {
        if (idx === 0) return; // Skip intro text before first product

        const hasViewProductLink = /\[View Product\]\(https?:\/\/.*?\)/.test(
          section
        );
        expect(hasViewProductLink).toBeTruthy();
      });
    }
  });

  test("Product format should be consistent across different queries", async ({
    request,
  }) => {
    const queries = ["laptop", "phone", "tablet"];

    for (const query of queries) {
      const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
        },
        data: {
          sessionId: `test-format-consistency-${query}-${Date.now()}`,
          message: query,
          history: [],
        },
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      const responseText = data.response;

      // Should have at least one product with proper format
      const hasProperFormat =
        /\*\*.*?\*\*\s+—\s+S\$\d+/.test(responseText) && // Has name and price
        /\[View Product\]/.test(responseText); // Has link

      expect(hasProperFormat).toBeTruthy();
    }
  });

  test("Multi-product response should have first image only", async ({
    request,
  }) => {
    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      data: {
        sessionId: `test-format-multi-image-${Date.now()}`,
        message: "any games", // Should return multiple products
        history: [],
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    const responseText = data.response;

    // Count images
    const imageMatches = responseText.match(/!\[.*?\]\(.*?\)/g);

    if (imageMatches) {
      // Should have exactly 1 image (first product only)
      expect(imageMatches.length).toBe(1);
    }
  });

  test("Empty/no results should have helpful message", async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      data: {
        sessionId: `test-format-empty-${Date.now()}`,
        message: "unicorn console bundle", // Likely no results
        history: [],
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    const responseText = data.response.toLowerCase();

    // Should have helpful message
    const hasHelpfulMessage =
      responseText.includes("no") ||
      responseText.includes("not available") ||
      responseText.includes("couldn't find") ||
      responseText.includes("sorry");

    expect(hasHelpfulMessage).toBeTruthy();
  });
});
