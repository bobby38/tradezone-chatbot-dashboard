# TradeZone Chatbot - Automated Test Suite

**Created:** November 30, 2025  
**Purpose:** Automated validation of all recent fixes and improvements  
**Framework:** Playwright

---

## Overview

This automated test suite validates all critical fixes implemented in the TradeZone chatbot system, eliminating the need for manual testing.

**User Request:**
> "once done can you adjust and run test to make sure all is good tired of manual testing, even some voice basic :)"

---

## Test Coverage

### ✅ 1. Storage Filter Tests (`storage-filter.spec.ts`)

**Related Commit:** `6d70726` - Tighter storage filter to drop accessories in nvme/ssd results

**Tests:**
- `nvme ssd query should only return actual storage devices`
  - Validates storage keywords present (SSD, NVMe, solid state)
  - Blocks cases, bags, covers
  - Blocks games, controllers, accessories
  - Blocks consoles (PlayStation, Xbox, Switch, Portal, Ally)
  
- `ssd query should only return SSDs, not laptops/PCs`
  - Returns actual SSDs
  - Excludes laptops/MacBooks/gaming PCs even if they contain SSDs
  
- `m.2 query should only return M.2 storage devices`
  - Returns M.2/NVMe drives
  - Excludes console expansion cards
  
- `hard drive query should return HDDs, not accessories`
  - Returns hard drives/HDDs
  - Excludes bags, housings, cases

**Why This Matters:** User complaint showed "nvme ssd" returning 12 products including cases, games, and drives. This test ensures the filter is strict.

---

### ✅ 2. Phone/Tablet Separation Tests (`phone-tablet-separation.spec.ts`)

**Related Fix:** Added bidirectional phone/tablet filtering

**Tests:**
- `phone query should only return phones, not tablets`
- `handphone query should only return phones, not tablets`
- `smartphone query should only return phones, not tablets`
- `tablet query should only return tablets, not phones`
- `ipad query should only return tablets, not iphones`
- `mobile query should return phones, not tablets`

**Why This Matters:** User requirement to keep phone and tablet categories properly separated.

---

### ✅ 3. Product Format Consistency Tests (`product-format-consistency.spec.ts`)

**Related Requirement:** 
> "Make sure the product structure is: the main one is a picture, and after you get all the items, the price and the link. Always the same answer."

**Tests:**
- `First product should always have image`
  - Validates markdown image syntax `![name](url)` present
  - First product section contains image
  
- `All products should have price in SGD format`
  - Every product has `S$XX.XX` format
  
- `All products should have View Product link`
  - Every product has `[View Product](url)` link
  
- `Product format should be consistent across different queries`
  - Tests laptop, phone, tablet queries
  - Validates consistent format: name, price, link
  
- `Multi-product response should have first image only`
  - Exactly 1 image (first product only)
  
- `Empty/no results should have helpful message`
  - Validates helpful error messages

**Why This Matters:** User complained about inconsistent product format. This ensures every response follows the same structure.

---

### ✅ 4. Prompt Injection Security Tests (`prompt-injection.spec.ts`)

**Related Requirement:**
> "i want to avoid prompt hacking make sure we are safe especially voice"

**High-Risk Tests (Should Block with 400 error):**
- `ignore previous instructions should be blocked`
- `you are now should be blocked`
- `SYSTEM tag should be blocked`
- `special tokens should be blocked` (`<|im_start|>`, etc.)
- `disregard instructions should be blocked`

**Medium-Risk Tests (Should Sanitize and Allow):**
- `pretend should be sanitized and allowed`
- `act like should be sanitized and allowed`

**Safe Tests (Should Work Normally):**
- `normal question with instruction words should work`
- `normal product query should work`
- `Control characters should be stripped`

**Multi-Pattern Test:**
- `Multiple injection attempts should all be blocked`
  - Tests 5 different malicious patterns
  - All should return 400 error

**Why This Matters:** Critical security feature to prevent prompt injection attacks, especially important for voice chat.

---

### ✅ 5. Product Family Filtering Tests (`product-family-filtering.spec.ts`)

**Existing Tests:**
- PS5 queries don't return Nintendo Switch/Xbox
- Xbox queries don't return PlayStation/Nintendo
- Nintendo Switch queries don't return PS/Xbox

**Why This Matters:** Prevents cross-contamination between console families.

---

### ✅ 6. Trade-In Price-First Flow Tests (`trade-in-price-first.spec.ts`)

**Existing Tests:**
- Trade-in workflow follows price-first pattern
- Contact collection happens correctly

**Why This Matters:** Ensures trade-in workflow collects information in correct order.

---

### ✅ 7. Performance Optimization Tests (`performance-optimization.spec.ts`)

**Existing Tests:**
- Response latency under 3 seconds
- Token usage optimized

**Why This Matters:** Validates performance improvements.

---

### ✅ 8. API Security Tests (`api-security.spec.ts`)

**Existing Tests:**
- API key authentication
- Request validation (empty messages, long messages)
- Malformed JSON rejection
- Rate limiting (skipped in local, enabled for production)

**Why This Matters:** Ensures API is properly secured.

---

## Running Tests

### Quick Start

```bash
# Run all critical tests
npm run test:critical

# Or manually:
./tests/run-critical-tests.sh
```

### Individual Test Suites

```bash
# Storage filter tests
npx playwright test storage-filter.spec.ts

# Phone/tablet separation tests
npx playwright test phone-tablet-separation.spec.ts

# Product format tests
npx playwright test product-format-consistency.spec.ts

# Prompt injection security tests
npx playwright test prompt-injection.spec.ts

# All tests
npm test
```

### Environment Setup

**Required:**
```bash
export CHATKIT_API_KEY='your-api-key'
```

**Optional (defaults to https://trade.rezult.co):**
```bash
export API_BASE_URL='http://localhost:3001'  # For local testing
```

---

## Test Environment

### Local Testing
1. Start dev server: `npm run dev`
2. Set API key: `export CHATKIT_API_KEY='your-key'`
3. Run tests: `npm run test:critical`

### Production Testing
1. Set production URL: `export API_BASE_URL='https://trade.rezult.co'`
2. Set API key: `export CHATKIT_API_KEY='your-key'`
3. Run tests: `npm run test:critical`

---

## Test Results Location

```
test-results/        # Screenshots and traces for failures
playwright-report/   # HTML report (run: npm run test:report)
```

---

## Adding New Tests

### Structure

```typescript
import { test, expect } from "@playwright/test";

const API_BASE_URL = process.env.API_BASE_URL || "https://trade.rezult.co";
const API_KEY = process.env.CHATKIT_API_KEY || "test-key";

test.describe("Your Test Suite Name", () => {
  test("should do something", async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      data: {
        sessionId: `test-${Date.now()}`,
        message: "your test query",
        history: [],
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    
    // Your assertions here
  });
});
```

### Adding to Critical Tests

1. Create test file: `tests/your-test.spec.ts`
2. Update `tests/run-critical-tests.sh`:
   ```bash
   echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
   echo "TEST X: Your Test Name"
   echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
   npx playwright test your-test.spec.ts --reporter=list
   ```

---

## Continuous Integration

**Recommended CI Setup:**
```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:critical
        env:
          CHATKIT_API_KEY: ${{ secrets.CHATKIT_API_KEY }}
          API_BASE_URL: https://trade.rezult.co
```

---

## Success Criteria

All tests should pass with:
- ✅ Storage queries return only storage devices
- ✅ Phone queries exclude tablets (and vice versa)
- ✅ First product always has image
- ✅ All products have price + link
- ✅ High-risk prompts blocked (400 error)
- ✅ Medium-risk prompts sanitized
- ✅ Safe prompts work normally
- ✅ API security enforced
- ✅ Performance within limits

---

## Troubleshooting

### Tests Failing Locally

**Problem:** Tests fail with connection errors  
**Solution:** Ensure dev server is running (`npm run dev`)

**Problem:** 401 Unauthorized errors  
**Solution:** Set API key (`export CHATKIT_API_KEY='your-key'`)

**Problem:** Tests timeout  
**Solution:** Check server is responding (`curl http://localhost:3001/api/health`)

### Tests Passing Locally but Failing in Production

**Problem:** Different behavior between environments  
**Solution:** Check production API_BASE_URL is correct

**Problem:** Rate limiting in production  
**Solution:** Tests may need delays between requests

---

## Next Steps

1. ✅ **All Tests Created** - 4 new test suites covering recent fixes
2. ✅ **Critical Test Script Updated** - Now runs all 8 test suites
3. 🔄 **Run Tests** - Execute `npm run test:critical` to validate
4. 📊 **Review Results** - Check for any failures
5. 🚀 **Deploy** - Once all tests pass, deploy to production
6. 📈 **Monitor** - Watch Coolify logs for performance metrics

---

## Summary

This automated test suite provides comprehensive validation of:
- ✅ Storage filtering accuracy
- ✅ Phone/tablet category separation
- ✅ Product format consistency
- ✅ Prompt injection security
- ✅ Family filtering
- ✅ Trade-in workflow
- ✅ Performance optimization
- ✅ API security

**No more manual testing required!** Just run `npm run test:critical` to validate all fixes.
