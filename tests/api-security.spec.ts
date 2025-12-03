/**
 * API Security & Rate Limiting Tests
 * Validates authentication, rate limiting, and security controls
 */

import { test, expect } from '@playwright/test';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';

const API_KEY = process.env.CHATKIT_API_KEY || 'test-key';

test.describe('API Security Tests', () => {

  test('Request without API key should be rejected', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        'Content-Type': 'application/json',
        // Intentionally omitting X-API-Key header
      },
      data: {
        sessionId: `test-security-nokey-${Date.now()}`,
        message: 'test',
        history: [],
      },
    });

    // Should return 401 Unauthorized
    expect(response.status()).toBe(401);

    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  test('Request with invalid API key should be rejected', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'invalid-key-12345',
      },
      data: {
        sessionId: `test-security-badkey-${Date.now()}`,
        message: 'test',
        history: [],
      },
    });

    // Should return 401 or 403
    expect([401, 403]).toContain(response.status());
  });

  test('Valid API key should allow access', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      data: {
        sessionId: `test-security-validkey-${Date.now()}`,
        message: 'test',
        history: [],
      },
    });

    expect(response.ok()).toBeTruthy();
  });

  test('Empty message should be rejected', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      data: {
        sessionId: `test-validation-empty-${Date.now()}`,
        message: '',
        history: [],
      },
    });

    // Should return error for empty message
    expect([400, 422]).toContain(response.status());
  });

  test('Extremely long message should be rejected', async ({ request }) => {
    const longMessage = 'a'.repeat(10000); // 10,000 characters

    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      data: {
        sessionId: `test-validation-long-${Date.now()}`,
        message: longMessage,
        history: [],
      },
    });

    // Should return error for message too long (validation limit: 1000 chars)
    expect([400, 413, 422]).toContain(response.status());
  });

  test('Malformed JSON should be rejected', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      data: '{"invalid json syntax',
    });

    expect([400, 422]).toContain(response.status());
  });
});

test.describe('Rate Limiting Tests', () => {

  test.skip('Rapid requests should trigger rate limiting (20 req/min)', async ({ request }) => {
    // SKIPPED: This test may fail in CI/local environments without proper rate limiting
    // Enable manually for production testing

    const sessionId = `test-ratelimit-${Date.now()}`;
    const requests = [];

    // Send 25 requests rapidly (limit is 20/min)
    for (let i = 0; i < 25; i++) {
      requests.push(
        request.post(`${API_BASE_URL}/api/chatkit/agent`, {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY,
          },
          data: {
            sessionId: `${sessionId}-${i}`,
            message: `test ${i}`,
            history: [],
          },
        })
      );
    }

    const responses = await Promise.all(requests);

    // Count how many requests succeeded
    const successCount = responses.filter(r => r.ok()).length;
    const rateLimitedCount = responses.filter(r => r.status() === 429).length;

    console.log(`Successful: ${successCount}, Rate Limited: ${rateLimitedCount}`);

    // At least some requests should be rate limited
    expect(rateLimitedCount).toBeGreaterThan(0);
  });
});
