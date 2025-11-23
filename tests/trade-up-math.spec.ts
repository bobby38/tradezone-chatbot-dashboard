/**
 * Trade-Up Math Guardrail Tests
 * Ensures two-device trade/upgrade replies quote source trade-in value and target price
 * (not the target trade-in value), and return a clear top-up line in ≤2 sentences.
 */

import { test, expect } from "@playwright/test";

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";
const API_KEY = process.env.CHATKIT_API_KEY || "test-key";

// Utility: extract all monetary-ish numbers from a response
function extractNumbers(text: string): number[] {
  const matches = text.match(/\b\d{2,5}\b/g);
  if (!matches) return [];
  return matches.map((n) => Number(n)).filter((n) => Number.isFinite(n));
}

test.describe("Trade-Up Math Guardrail", () => {
  test("PS4 Pro -> Xbox Series X Digital uses source trade value, not target trade value", async ({
    request,
  }) => {
    const sessionId = `test-tradeup-${Date.now()}`;

    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      data: {
        sessionId,
        message: "Trade PS4 Pro 1TB for Xbox Series X Digital on installment",
        history: [],
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    const text = (data.response || "").toLowerCase();

    // Basic content assertions
    expect(text).toContain("ps4");
    expect(text).toContain("xbox");
    expect(text).toContain("top");
    expect(text.split(".").length).toBeLessThanOrEqual(4); // roughly ≤2 sentences

    // Should NOT say "Xbox Series X trade-in"
    expect(text.includes("xbox series x trade-in")).toBeFalsy();

    // Numeric sanity: smallest number should look like a trade-in (<=200),
    // largest should look like a retail price (>=500), and there should be a top-up in between.
    const nums = extractNumbers(text);
    expect(nums.length).toBeGreaterThanOrEqual(2);
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    expect(min).toBeLessThanOrEqual(200); // PS4 Pro trade-in grid is ~100
    expect(max).toBeGreaterThanOrEqual(500); // Xbox Series X retail ~600
  });
});
