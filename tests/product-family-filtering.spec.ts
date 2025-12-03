/**
 * Product Family Filtering Tests
 * Tests critical family filtering to ensure PS5 queries don't return Switch/Xbox products
 *
 * Related Commits:
 * - 285d968: Add product family filtering to catalog search
 * - f04103e: Add family filtering to WooCommerce fallback
 */

import { test, expect } from "@playwright/test";

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3001";
const API_KEY = process.env.CHATKIT_API_KEY || "test-key";

test.describe("Product Family Filtering - Critical Tests", () => {
  test("PS5 bundle query should NOT return Nintendo Switch products", async ({
    request,
  }) => {
    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      data: {
        sessionId: `test-ps5-filtering-${Date.now()}`,
        message: "any ps5 bundle",
        history: [],
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    // Response should contain content
    expect(data.response).toBeDefined();
    const responseText = data.response.toLowerCase();

    // Should mention PS5 products
    const hasPS5Content =
      responseText.includes("ps5") ||
      responseText.includes("playstation 5") ||
      responseText.includes("ghost of yotei") ||
      responseText.includes("30th anniversary");

    expect(hasPS5Content).toBeTruthy();

    // Should NOT mention Nintendo Switch
    const hasNintendoContamination =
      responseText.includes("switch") ||
      responseText.includes("nintendo") ||
      responseText.includes("zelda") ||
      responseText.includes("mario");

    expect(hasNintendoContamination).toBeFalsy();

    // Should NOT mention Xbox
    const hasXboxContamination =
      responseText.includes("xbox") ||
      responseText.includes("series x") ||
      responseText.includes("series s");

    expect(hasXboxContamination).toBeFalsy();

    // Should NOT mention racing wheels (Moza R3)
    const hasRacingWheelContamination =
      responseText.includes("moza") || responseText.includes("racing wheel");

    expect(hasRacingWheelContamination).toBeFalsy();
  });

  test("Xbox query should only return Xbox products", async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      data: {
        sessionId: `test-xbox-filtering-${Date.now()}`,
        message: "xbox bundles",
        history: [],
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    const responseText = data.response.toLowerCase();

    // Should mention Xbox
    const hasXboxContent =
      responseText.includes("xbox") ||
      responseText.includes("series x") ||
      responseText.includes("series s");

    expect(hasXboxContent).toBeTruthy();

    // Should NOT mention PlayStation
    const hasPSContamination =
      responseText.includes("ps5") ||
      responseText.includes("ps4") ||
      responseText.includes("playstation");

    expect(hasPSContamination).toBeFalsy();

    // Should NOT mention Nintendo
    const hasNintendoContamination =
      responseText.includes("switch") || responseText.includes("nintendo");

    expect(hasNintendoContamination).toBeFalsy();
  });

  test("Nintendo Switch query should only return Switch products", async ({
    request,
  }) => {
    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      data: {
        sessionId: `test-switch-filtering-${Date.now()}`,
        message: "switch bundles",
        history: [],
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    const responseText = data.response.toLowerCase();

    // Should mention Switch
    const hasSwitchContent =
      responseText.includes("switch") || responseText.includes("nintendo");

    expect(hasSwitchContent).toBeTruthy();

    // Should NOT mention PlayStation
    const hasPSContamination =
      responseText.includes("ps5") ||
      responseText.includes("ps4") ||
      responseText.includes("playstation");

    expect(hasPSContamination).toBeFalsy();

    // Should NOT mention Xbox
    const hasXboxContamination = responseText.includes("xbox");

    expect(hasXboxContamination).toBeFalsy();
  });
});
