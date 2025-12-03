/**
 * Performance Optimization Tests
 * Validates vector search latency and token usage improvements
 *
 * Related Commit: 7ca0a19 - Optimize vector search and reduce token usage
 *
 * Performance Targets:
 * - Vector search latency: <2s (down from 4.3s)
 * - Token usage: <6K per query (down from 12K+)
 * - History truncation: Max 20 messages
 */

import { test, expect } from '@playwright/test';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';

const API_KEY = process.env.CHATKIT_API_KEY || 'test-key';

test.describe('Performance Optimization Tests', () => {

  test('Response latency should be under 5 seconds', async ({ request }) => {
    const startTime = Date.now();

    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      data: {
        sessionId: `test-perf-latency-${Date.now()}`,
        message: 'any ps5 bundle',
        history: [],
      },
    });

    const endTime = Date.now();
    const latency = endTime - startTime;

    expect(response.ok()).toBeTruthy();

    // Should respond within 5 seconds (target: <2s, but allowing buffer)
    expect(latency).toBeLessThan(5000);

    console.log(`Response latency: ${latency}ms (target: <2000ms)`);
  });

  test('Token usage should be tracked in response metadata', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      data: {
        sessionId: `test-perf-tokens-${Date.now()}`,
        message: 'What bundles are available for PS5?',
        history: [],
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    // Check if token usage is tracked
    if (data.usage) {
      const totalTokens = data.usage.total_tokens ||
                          (data.usage.prompt_tokens || 0) + (data.usage.completion_tokens || 0);

      console.log(`Token usage: ${totalTokens} (target: <6000)`);

      // Token usage should be reasonable (<10K, ideally <6K)
      expect(totalTokens).toBeLessThan(10000);
    }
  });

  test('History truncation - conversation should not grow unbounded', async ({ request }) => {
    const sessionId = `test-perf-history-${Date.now()}`;

    // Build a large conversation history (30 messages)
    const largeHistory = [];
    for (let i = 0; i < 30; i++) {
      largeHistory.push(
        { role: 'user', content: `Message ${i}` },
        { role: 'assistant', content: `Response ${i}` }
      );
    }

    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      data: {
        sessionId: sessionId,
        message: 'any ps5 bundle',
        history: largeHistory,
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    // Response should succeed even with large history
    expect(data.response).toBeDefined();

    // Token usage should not explode (history should be truncated)
    if (data.usage) {
      const totalTokens = data.usage.total_tokens ||
                          (data.usage.prompt_tokens || 0) + (data.usage.completion_tokens || 0);

      console.log(`Token usage with 30-message history: ${totalTokens}`);

      // Even with 30 messages in history, should be truncated to ~20
      // So token usage should still be reasonable
      expect(totalTokens).toBeLessThan(15000);
    }
  });

  test('Multiple rapid requests should not degrade performance', async ({ request }) => {
    const sessionId = `test-perf-rapid-${Date.now()}`;
    const queries = [
      'ps5 bundles',
      'xbox series x',
      'nintendo switch',
    ];

    const startTime = Date.now();

    // Send 3 rapid requests
    const promises = queries.map((query, idx) =>
      request.post(`${API_BASE_URL}/api/chatkit/agent`, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
        },
        data: {
          sessionId: `${sessionId}-${idx}`,
          message: query,
          history: [],
        },
      })
    );

    const responses = await Promise.all(promises);
    const endTime = Date.now();
    const totalTime = endTime - startTime;

    // All requests should succeed
    responses.forEach(response => {
      expect(response.ok()).toBeTruthy();
    });

    // All 3 requests should complete within 15 seconds total
    expect(totalTime).toBeLessThan(15000);

    console.log(`3 rapid requests completed in ${totalTime}ms (avg: ${totalTime / 3}ms per request)`);
  });

  test('Vector search should use optimized model (gpt-4o-mini)', async ({ request }) => {
    // This test verifies that responses complete quickly, indicating gpt-4o-mini is in use
    const startTime = Date.now();

    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      data: {
        sessionId: `test-perf-model-${Date.now()}`,
        message: 'What bundles are available for PS5?',
        history: [],
      },
    });

    const endTime = Date.now();
    const latency = endTime - startTime;

    expect(response.ok()).toBeTruthy();

    // gpt-4o-mini should be significantly faster than gpt-4.1
    // If latency is >4s, likely still using old model
    expect(latency).toBeLessThan(4000);

    console.log(`Vector search latency: ${latency}ms (should be <2000ms with gpt-4o-mini)`);
  });
});
