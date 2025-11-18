/**
 * Trade-In Price-First Flow Tests
 * Ensures agent shows trade-in price BEFORE asking qualifying questions
 *
 * Related Commit: 402d5b6 - Enforce price-first flow for trade-in conversations
 */

import { test, expect } from '@playwright/test';

const API_BASE_URL = process.env.API_BASE_URL || 'https://trade.rezult.co';
  ? 'https://trade.rezult.co'
  : 'http://localhost:3001';

const API_KEY = process.env.CHATKIT_API_KEY || 'test-key';

test.describe('Trade-In Price-First Flow - Critical Tests', () => {

  test('Xbox Series S upgrade query should show price BEFORE asking condition', async ({ request }) => {
    const sessionId = `test-tradein-pricefirst-${Date.now()}`;

    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      data: {
        sessionId: sessionId,
        message: 'Can I upgrade from Xbox Series S to Series X?',
        history: [],
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    const responseText = data.response.toLowerCase();

    // CRITICAL: First response MUST include price information
    const hasPriceInfo =
      responseText.includes('s$') ||
      responseText.includes('$150') ||
      responseText.includes('trade-in') ||
      responseText.includes('150');

    expect(hasPriceInfo).toBeTruthy();

    // CRITICAL: First response should NOT ask about condition
    const asksConditionFirst =
      responseText.includes('what condition') ||
      responseText.includes('mint') ||
      responseText.includes('good') ||
      responseText.includes('fair') ||
      responseText.includes('faulty');

    expect(asksConditionFirst).toBeFalsy();

    // Response should mention upgrade path
    const mentionsUpgrade =
      responseText.includes('upgrade') ||
      responseText.includes('series x') ||
      responseText.includes('top up');

    expect(mentionsUpgrade).toBeTruthy();
  });

  test('PS5 trade-in query should quote price immediately', async ({ request }) => {
    const sessionId = `test-tradein-ps5-${Date.now()}`;

    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      data: {
        sessionId: sessionId,
        message: 'What is the trade-in value for PS5?',
        history: [],
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    const responseText = data.response.toLowerCase();

    // Must include PS5 trade-in price range (S$350-380 for standard)
    const hasPriceInfo =
      responseText.includes('s$') ||
      responseText.includes('350') ||
      responseText.includes('380') ||
      responseText.includes('trade-in');

    expect(hasPriceInfo).toBeTruthy();

    // Should mention PS5
    const mentionsPS5 =
      responseText.includes('ps5') ||
      responseText.includes('playstation 5');

    expect(mentionsPS5).toBeTruthy();
  });

  test('Condition question should only come AFTER user confirms interest', async ({ request }) => {
    const sessionId = `test-tradein-sequence-${Date.now()}`;

    // First message: Ask about trade-in
    const firstResponse = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      data: {
        sessionId: sessionId,
        message: 'I want to trade in my Xbox Series S',
        history: [],
      },
    });

    expect(firstResponse.ok()).toBeTruthy();
    const firstData = await firstResponse.json();
    const firstText = firstData.response.toLowerCase();

    // First response should have price
    expect(firstText.includes('s$') || firstText.includes('150')).toBeTruthy();

    // Second message: User confirms interest
    const secondResponse = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      data: {
        sessionId: sessionId,
        message: 'Yes, I want to proceed',
        history: [
          { role: 'user', content: 'I want to trade in my Xbox Series S' },
          { role: 'assistant', content: firstData.response },
        ],
      },
    });

    expect(secondResponse.ok()).toBeTruthy();
    const secondData = await secondResponse.json();
    const secondText = secondData.response.toLowerCase();

    // NOW it should ask about condition (after user confirmed)
    const asksCondition =
      secondText.includes('condition') ||
      secondText.includes('mint') ||
      secondText.includes('good') ||
      secondText.includes('fair');

    expect(asksCondition).toBeTruthy();
  });

  test('Trade-in price accuracy - Xbox Series S should be S$150', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      data: {
        sessionId: `test-tradein-accuracy-${Date.now()}`,
        message: 'How much for Xbox Series S trade-in?',
        history: [],
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    const responseText = data.response.toLowerCase();

    // Should include correct price: S$150
    const hasCorrectPrice =
      responseText.includes('150') ||
      responseText.includes('s$150');

    expect(hasCorrectPrice).toBeTruthy();
  });

  test('Trade-in price accuracy - Xbox Series X should be S$350', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      data: {
        sessionId: `test-tradein-seriesx-${Date.now()}`,
        message: 'How much for Xbox Series X trade-in?',
        history: [],
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    const responseText = data.response.toLowerCase();

    // Should include correct price: S$350
    const hasCorrectPrice =
      responseText.includes('350') ||
      responseText.includes('s$350');

    expect(hasCorrectPrice).toBeTruthy();
  });
});
