import { test, expect } from "@playwright/test";

const API_ENDPOINT = "/api/chatkit/agent";
const API_KEY =
  process.env.PLAYWRIGHT_CHATKIT_API_KEY ||
  process.env.CHATKIT_API_KEY ||
  process.env.NEXT_PUBLIC_CHATKIT_WIDGET_KEY ||
  "";

test.describe("Vague Query Clarification", () => {
  test.skip(
    !API_KEY,
    "Set PLAYWRIGHT_CHATKIT_API_KEY or NEXT_PUBLIC_CHATKIT_WIDGET_KEY for agent tests",
  );

  test("should ask for platform clarification on 'any games'", async ({
    request,
  }) => {
    const response = await request.post(API_ENDPOINT, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      data: {
        message: "any games",
        sessionId: `test-vague-games-${Date.now()}`,
      },
    });

    expect(response.ok()).toBeTruthy();
    const responseBody = await response.json();

    console.log("Response:", responseBody.response);

    // Should ask for clarification, NOT just list 2 products
    const responseText = responseBody.response.toLowerCase();

    // Should contain platform options
    const hasPlatformOptions =
      (responseText.includes("ps5") || responseText.includes("ps4") ||
       responseText.includes("switch") || responseText.includes("pc")) &&
      responseText.includes("?");

    // Should NOT be deterministic product list
    const isDeterministicList = responseText.includes("here's what we have (2 products)");

    expect(hasPlatformOptions).toBeTruthy();
    expect(isDeterministicList).toBeFalsy();

    // Should be short and conversational
    expect(responseBody.response.length).toBeLessThan(200);
  });

  test("should ask for brand clarification on 'gaming laptop'", async ({
    request,
  }) => {
    const response = await request.post(API_ENDPOINT, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      data: {
        message: "gaming laptop",
        sessionId: `test-vague-laptop-${Date.now()}`,
      },
    });

    expect(response.ok()).toBeTruthy();
    const responseBody = await response.json();

    console.log("Response:", responseBody.response);

    const responseText = responseBody.response.toLowerCase();

    // Should ask for specs/brand
    const hasSpecOptions =
      (responseText.includes("16gb") || responseText.includes("32gb") ||
       responseText.includes("brand") || responseText.includes("spec")) &&
      responseText.includes("?");

    expect(hasSpecOptions).toBeTruthy();
    expect(responseBody.response.length).toBeLessThan(200);
  });

  test("should ask for brand clarification on 'any tablet'", async ({
    request,
  }) => {
    const response = await request.post(API_ENDPOINT, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      data: {
        message: "any tablet",
        sessionId: `test-vague-tablet-${Date.now()}`,
      },
    });

    expect(response.ok()).toBeTruthy();
    const responseBody = await response.json();

    console.log("Response:", responseBody.response);

    const responseText = responseBody.response.toLowerCase();

    // Should mention tablet brands
    const hasBrandOptions =
      (responseText.includes("ipad") || responseText.includes("galaxy") ||
       responseText.includes("surface")) &&
      responseText.includes("?");

    expect(hasBrandOptions).toBeTruthy();
    expect(responseBody.response.length).toBeLessThan(200);
  });

  test("should still return products for specific queries", async ({
    request,
  }) => {
    const response = await request.post(API_ENDPOINT, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      data: {
        message: "PS5 games",
        sessionId: `test-specific-ps5-${Date.now()}`,
      },
    });

    expect(response.ok()).toBeTruthy();
    const responseBody = await response.json();

    console.log("Response:", responseBody.response);

    // Specific query should return product list
    const hasProductList =
      responseBody.response.includes("**") || // Bold product names
      responseBody.response.includes("S$");    // Prices

    expect(hasProductList).toBeTruthy();
  });
});
