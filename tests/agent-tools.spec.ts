import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";

const API_ENDPOINT = "/api/chatkit/agent";
const API_KEY =
  process.env.PLAYWRIGHT_CHATKIT_API_KEY ||
  process.env.CHATKIT_API_KEY ||
  process.env.NEXT_PUBLIC_CHATKIT_WIDGET_KEY ||
  "";

test.describe("Agent Tools API", () => {
  test.skip(
    !API_KEY,
    "Set PLAYWRIGHT_CHATKIT_API_KEY or NEXT_PUBLIC_CHATKIT_WIDGET_KEY for agent tests",
  );

  test("should successfully use vectorSearch for an existing product", async ({
    request,
  }) => {
    const response = await request.post(API_ENDPOINT, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      data: {
        message: "Do you have Pokemon Legends: Z-A?",
        sessionId: "test-session-vector",
      },
    });

    expect(response.ok()).toBeTruthy();
    const responseBody = await response.json();
    expect(responseBody.response).not.toContain("generic response");
    expect(responseBody.response).toContain("Pokemon Legends: Z-A");
  });

  test("should fall back to perplexitySearch for a non-existing product", async ({
    request,
  }) => {
    const response = await request.post(API_ENDPOINT, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      data: {
        message: "Do you have a PlayStation 5?",
        sessionId: "test-session-perplexity",
      },
    });

    expect(response.ok()).toBeTruthy();
    const responseBody = await response.json();
    expect(responseBody.response).not.toContain(
      "Web search is currently unavailable",
    );
    expect(responseBody.response).not.toContain(
      "I encountered an error searching the website",
    );
  });
  test("should provide a response for a query that previously failed", async ({
    request,
  }) => {
    const response = await request.post(API_ENDPOINT, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      data: {
        message: "Any Playstation 4",
        sessionId: "test-session-ps4",
      },
    });

    expect(response.ok()).toBeTruthy();
    const responseBody = await response.json();
    expect(responseBody.response).not.toBe("");
  });
});

test.describe("Prompt configuration", () => {
  const projectRoot = path.resolve(__dirname, "..");

  test("default trade-in prompt treats photos as optional", async () => {
    const promptPath = path.join(
      projectRoot,
      "lib",
      "chatkit",
      "defaultPrompt.ts",
    );
    const prompt = readFileSync(promptPath, "utf-8");

    // Verify photo guidance exists and treats photos as optional
    expect(prompt).toContain("Ask for photos BEFORE submission");
    expect(prompt).toContain("Photos: {Provided | Not provided");
    expect(prompt).toContain("If user says no/later:");
    expect(prompt).toContain("Always respond in English");
  });

  test("trade-in system context aligns with optional photo guidance", async () => {
    const tradeInPromptPath = path.join(
      projectRoot,
      "lib",
      "chatkit",
      "tradeInPrompts.ts",
    );
    const tradeInPrompt = readFileSync(tradeInPromptPath, "utf-8");

    // Verify English enforcement and core trade-in flow
    expect(tradeInPrompt).toContain("Always respond in ENGLISH ONLY");
    expect(tradeInPrompt).toContain("SAVE DATA IMMEDIATELY");
    expect(tradeInPrompt).toContain("Step-by-Step");
  });
});
