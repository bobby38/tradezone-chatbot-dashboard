import { test, expect } from "@playwright/test";

test.describe("Agent Tools API", () => {
  const API_ENDPOINT = "/api/chatkit/agent";

  test("should successfully use vectorSearch for an existing product", async ({
    request,
  }) => {
    const response = await request.post(API_ENDPOINT, {
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
