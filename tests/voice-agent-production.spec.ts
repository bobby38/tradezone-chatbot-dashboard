/**
 * Voice Agent Production Tests
 * Tests the deployed voice agent's price lookup and variant selection
 *
 * Tests against: https://trade.rezult.co (production)
 */

import { test, expect } from "@playwright/test";

const API_BASE_URL = process.env.API_BASE_URL || "https://trade.rezult.co";
const API_KEY =
  process.env.CHATKIT_API_KEY || "YOUR_CHATKIT_API_KEY";

test.describe("Voice Agent - Trade-In Price Lookup", () => {
  test("Should find PS4 Pro 1TB trade-in price", async ({ request }) => {
    const sessionId = `voice-test-${Date.now()}`;

    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      data: {
        sessionId: sessionId,
        message: "Trade my PS4 Pro 1TB for PS5",
        history: [],
      },
    });

    if (!response.ok()) {
      const errorText = await response.text();
      console.error("❌ API Error:", response.status(), errorText);
    }

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    if (!data.response) {
      console.error("❌ No response in data:", JSON.stringify(data, null, 2));
    }

    const responseText = data.response.toLowerCase();

    // Should mention PS4 Pro and price around $100
    expect(responseText).toMatch(/ps4.*pro/i);
    expect(responseText).toMatch(/\$?100|\$?150/); // Allow range

    console.log("✅ PS4 Pro price found:", responseText.substring(0, 200));
  });

  test("Should show multiple PS5 options when variant unclear", async ({
    request,
  }) => {
    const sessionId = `voice-test-${Date.now()}`;

    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      data: {
        sessionId: sessionId,
        message: "I want a PS5",
        history: [],
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    const responseText = data.response.toLowerCase();

    // Should ask which PS5 or show options
    const showsOptions =
      responseText.includes("which ps5") ||
      responseText.includes("slim") ||
      responseText.includes("pro") ||
      responseText.includes("digital") ||
      responseText.includes("disc");

    expect(showsOptions).toBeTruthy();
    console.log("✅ PS5 options shown:", responseText.substring(0, 200));
  });

  test("Should handle MSI Claw with correct trade-in price $200", async ({
    request,
  }) => {
    const sessionId = `voice-test-${Date.now()}`;

    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      data: {
        sessionId: sessionId,
        message: "Trade MSI Claw 512GB for PS5 Pro 2TB Digital",
        history: [],
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    const responseText = data.response.toLowerCase();

    // Should mention MSI Claw and price $200
    expect(responseText).toMatch(/msi|claw/i);
    expect(responseText).toMatch(/\$?200/);

    console.log("✅ MSI Claw price found:", responseText.substring(0, 200));
  });

  test("Should calculate correct top-up for PS4 Pro → PS5 Pro", async ({
    request,
  }) => {
    const sessionId = `voice-test-${Date.now()}`;

    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      data: {
        sessionId: sessionId,
        message: "Trade PS4 Pro 1TB for PS5 Pro 2TB Digital",
        history: [],
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    const responseText = data.response.toLowerCase();

    // Should show both prices and top-up calculation
    expect(responseText).toMatch(/ps4.*100/i);
    expect(responseText).toMatch(/ps5.*pro/i);
    expect(responseText).toMatch(/top.*up|top-up/i);

    console.log("✅ Top-up calculation shown:", responseText.substring(0, 300));
  });
});

test.describe("Voice Agent - Error Handling", () => {
  test("Should handle unknown device gracefully", async ({ request }) => {
    const sessionId = `voice-test-${Date.now()}`;

    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      data: {
        sessionId: sessionId,
        message: "Trade my SuperConsole 9000",
        history: [],
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    const responseText = data.response.toLowerCase();

    // Should ask for clarification or say not found
    const handlesGracefully =
      responseText.includes("can't find") ||
      responseText.includes("not found") ||
      responseText.includes("describe") ||
      responseText.includes("clarify");

    expect(handlesGracefully).toBeTruthy();
    console.log("✅ Unknown device handled:", responseText.substring(0, 200));
  });
});
