# TradeZone Chatbot - Automated Test Suite

## Overview

Automated test suite using Playwright to validate critical functionality after January 18, 2025 optimizations.

## Test Coverage

### 1. Product Family Filtering Tests (`product-family-filtering.spec.ts`)
Validates that product searches respect family boundaries (PS5/Xbox/Switch).

**Critical Tests:**
- ✅ PS5 bundle query should NOT return Nintendo Switch products
- ✅ Xbox query should only return Xbox products
- ✅ Nintendo Switch query should only return Switch products

**Related Commits:**
- `285d968` - Add product family filtering to catalog search
- `f04103e` - Add family filtering to WooCommerce fallback

---

### 2. Trade-In Price-First Flow Tests (`trade-in-price-first.spec.ts`)
Ensures agent shows trade-in price BEFORE asking qualifying questions.

**Critical Tests:**
- ✅ Xbox Series S upgrade query should show price BEFORE asking condition
- ✅ PS5 trade-in query should quote price immediately
- ✅ Condition question should only come AFTER user confirms interest
- ✅ Trade-in price accuracy (Xbox Series S = S$150, Series X = S$350)

**Related Commit:**
- `402d5b6` - Enforce price-first flow for trade-in conversations

---

### 3. Performance Optimization Tests (`performance-optimization.spec.ts`)
Validates latency and token usage improvements.

**Performance Targets:**
- ✅ Response latency: <5s (ideally <2s, down from 4.3s)
- ✅ Token usage: <10K (ideally <6K, down from 12K+)
- ✅ History truncation: Max 20 messages
- ✅ Multiple rapid requests should not degrade performance

**Related Commit:**
- `7ca0a19` - Optimize vector search and reduce token usage

---

### 4. API Security Tests (`api-security.spec.ts`)
Validates authentication, rate limiting, and input validation.

**Security Tests:**
- ✅ Request without API key should be rejected (401)
- ✅ Request with invalid API key should be rejected (401/403)
- ✅ Valid API key should allow access
- ✅ Empty message should be rejected (400/422)
- ✅ Extremely long message should be rejected (413/422)
- ✅ Malformed JSON should be rejected (400/422)

---

## Quick Start

### Prerequisites

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Set Environment Variables:**
   ```bash
   export CHATKIT_API_KEY='your-api-key'
   ```

3. **Start Dev Server (for local testing):**
   ```bash
   npm run dev
   ```

### Running Tests

**Run All Critical Tests:**
```bash
npm run test:critical
```

**Run Specific Test Suite:**
```bash
# Product family filtering
npx playwright test product-family-filtering.spec.ts

# Trade-in price-first flow
npx playwright test trade-in-price-first.spec.ts

# Performance optimization
npx playwright test performance-optimization.spec.ts

# API security
npx playwright test api-security.spec.ts
```

**Run All Tests:**
```bash
npm test
```

**Interactive UI Mode:**
```bash
npm run test:ui
```

**View Test Report:**
```bash
npm run test:report
```

---

## Test Environments

### Local Testing
```bash
# Start dev server
npm run dev

# In another terminal
export CHATKIT_API_KEY='your-key'
npm run test:critical
```

### Production Testing
```bash
export CHATKIT_API_KEY='production-key'
export API_BASE_URL='https://trade.rezult.co'
npm run test:critical
```

---

## Interpreting Results

### Success Criteria

**All tests should pass with:**
- ✅ Zero product family cross-contamination
- ✅ Trade-in price shown BEFORE condition questions
- ✅ Response latency consistently <5s
- ✅ Token usage <10K per query
- ✅ API authentication working correctly

### Common Failures

**Product family contamination:**
```
Expected: false
Received: true
```
**Cause:** Family filtering not working, WooCommerce fallback contaminated
**Fix:** Check `lib/chatkit/productCatalog.ts` and `lib/agent-tools/index.ts`

**Trade-in asking condition before price:**
```
Expected: false (asksConditionFirst)
Received: true
```
**Cause:** Price-first flow not enforced
**Fix:** Check `lib/chatkit/tradeInPrompts.ts`

**High latency (>5s):**
```
Expected: latency < 5000
Received: 6723
```
**Cause:** Still using gpt-4.1 instead of gpt-4.1-mini
**Fix:** Check `lib/tools/vectorSearch.ts` model configuration

**High token usage (>10K):**
```
Token usage: 12490 (target: <6000)
```
**Cause:** History truncation not working
**Fix:** Check `app/api/chatkit/agent/route.ts` history truncation logic

---

## Continuous Integration

### GitHub Actions (Future)
```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npx playwright install --with-deps
      - run: npm run test:critical
        env:
          CHATKIT_API_KEY: ${{ secrets.CHATKIT_API_KEY }}
```

### Pre-deployment Checklist

Before deploying to production:
1. ✅ Run `npm run test:critical` locally
2. ✅ All critical tests pass
3. ✅ Review performance metrics (latency, tokens)
4. ✅ Deploy to Coolify
5. ✅ Run tests against production URL
6. ✅ Monitor Coolify logs for 24 hours

---

## Test Data Reference

### Trade-In Prices (from `data/tradezone_price_grid.jsonl`)

| Product | Condition | Trade-In Value |
|---------|-----------|----------------|
| Xbox Series S | Preowned | S$150 |
| Xbox Series X | Preowned | S$350 |
| PS5 Standard | Preowned | S$350-380 |
| PS5 Digital | Preowned | S$280-300 |

### Product Families

| Family ID | Keywords | Example Products |
|-----------|----------|------------------|
| `playstation_5` | ps5, playstation 5 | Ghost of Yotei, 30th Anniversary |
| `playstation_4` | ps4, playstation 4 | God of War, Spider-Man |
| `xbox_series` | xbox series, series x/s | Xbox Series X/S consoles |
| `nintendo_switch` | switch, nintendo | Mario, Zelda |
| `handheld_pc` | steam deck, rog ally | Ally, Legion Go |
| `vr_wearables` | quest, psvr, vr | Meta Quest, PSVR2 |

---

## Troubleshooting

### Tests timing out
```bash
# Increase timeout
npx playwright test --timeout=30000
```

### API key not working
```bash
# Verify key is set
echo $CHATKIT_API_KEY

# Check .env.local
cat .env.local | grep CHATKIT_API_KEY
```

### Dev server not detected
```bash
# Check if running
curl http://localhost:3001/api/health

# Or manually set URL
export API_BASE_URL='http://localhost:3000'
```

### Rate limiting errors (429)
```bash
# Wait 60 seconds between test runs
# Or use different session IDs
```

---

## Contributing

### Adding New Tests

1. Create test file in `tests/` directory
2. Follow naming convention: `feature-name.spec.ts`
3. Add to `run-critical-tests.sh` if critical
4. Update this README with test coverage

### Test Template

```typescript
import { test, expect } from '@playwright/test';

const API_BASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL 
  ? 'https://trade.rezult.co' 
  : 'http://localhost:3001';

const API_KEY = process.env.CHATKIT_API_KEY || 'test-key';

test.describe('Feature Name Tests', () => {
  test('should do something specific', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      data: {
        session_id: `test-feature-${Date.now()}`,
        message: 'test query',
        history: [],
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    
    // Your assertions here
  });
});
```

---

## Related Documentation

- `FINAL_TESTING_CHECKLIST.md` - Manual testing checklist
- `PERFORMANCE_OPTIMIZATION_PLAN.md` - Performance targets and analysis
- `TESTING_CHECKLIST_2025-01-18.md` - Original testing plan
- `AGENT.md` - Full project changelog and documentation

---

**Last Updated:** January 18, 2025  
**Test Suite Version:** 1.0.0  
**Status:** ✅ Ready for production testing
