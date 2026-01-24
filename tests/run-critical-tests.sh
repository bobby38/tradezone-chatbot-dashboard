#!/bin/bash
# Run Critical Tests - November 30, 2025
# Comprehensive test suite for all recent fixes:
# - Storage filter improvements (accessories removal)
# - Phone/tablet category separation
# - Product format consistency
# - Prompt injection security
# - Family filtering
# - Performance optimizations

# Don't exit on failure - we want to run all tests and show summary
# set -e

FAILED_TESTS=0
PASSED_TESTS=0

echo "🧪 TradeZone Chatbot - Critical Test Suite"
echo "=========================================="
echo ""

# Check if API key is set
if [ -z "$CHATKIT_API_KEY" ]; then
  echo "⚠️  Warning: CHATKIT_API_KEY not set"
  echo "   Set it with: export CHATKIT_API_KEY='your-key'"
  echo ""
fi

# Check if dev server is running
echo "🔍 Checking if dev server is running..."
if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
  echo "✅ Dev server is running on port 3001"
  export API_BASE_URL="http://localhost:3001"
elif curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
  echo "✅ Dev server is running on port 3000"
  export API_BASE_URL="http://localhost:3000"
else
  echo "❌ Dev server not detected. Start it with: npm run dev"
  echo "   Or set API_BASE_URL to production: export API_BASE_URL='https://trade.rezult.co'"
  echo ""
fi

echo ""
echo "📋 Test Plan:"
echo "1. Product Family Filtering (PS5/Xbox/Switch)"
echo "2. Storage Filter (NVMe/SSD accessories removal)"
echo "3. Phone/Tablet Category Separation"
echo "4. Product Format Consistency"
echo "5. Prompt Injection Security"
echo "6. Trade-In Price-First Flow"
echo "7. Performance Optimization (latency & tokens)"
echo "8. API Security & Authentication"
echo ""

# Run tests with detailed output
echo "🚀 Running tests..."
echo ""

# Test 1: Product Family Filtering
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 1: Product Family Filtering"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if npx playwright test product-family-filtering.spec.ts --reporter=list; then
  ((PASSED_TESTS++))
else
  ((FAILED_TESTS++))
fi

# Test 2: Storage Filter
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 2: Storage Filter (NVMe/SSD)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if npx playwright test storage-filter.spec.ts --reporter=list; then
  ((PASSED_TESTS++))
else
  ((FAILED_TESTS++))
fi

# Test 3: Phone/Tablet Separation
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 3: Phone/Tablet Category Separation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if npx playwright test phone-tablet-separation.spec.ts --reporter=list; then
  ((PASSED_TESTS++))
else
  ((FAILED_TESTS++))
fi

# Test 4: Product Format Consistency
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 4: Product Format Consistency"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if npx playwright test product-format-consistency.spec.ts --reporter=list; then
  ((PASSED_TESTS++))
else
  ((FAILED_TESTS++))
fi

# Test 5: Prompt Injection Security
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 5: Prompt Injection Security"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if npx playwright test prompt-injection.spec.ts --reporter=list; then
  ((PASSED_TESTS++))
else
  ((FAILED_TESTS++))
fi

# Test 6: Trade-In Price-First Flow
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 6: Trade-In Price-First Flow"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if npx playwright test trade-in-price-first.spec.ts --reporter=list; then
  ((PASSED_TESTS++))
else
  ((FAILED_TESTS++))
fi

# Test 7: Performance Optimization
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 7: Performance Optimization"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if npx playwright test performance-optimization.spec.ts --reporter=list; then
  ((PASSED_TESTS++))
else
  ((FAILED_TESTS++))
fi

# Test 8: API Security
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 8: API Security & Authentication"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if npx playwright test api-security.spec.ts --reporter=list; then
  ((PASSED_TESTS++))
else
  ((FAILED_TESTS++))
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 FINAL RESULTS: $PASSED_TESTS passed, $FAILED_TESTS failed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Test Summary:"
echo "   View detailed results above"
echo "   Check test-results/ for failure screenshots"
echo ""
echo "🚀 Next Steps:"
echo "   1. Review any failures"
echo "   2. If all pass: Deploy to production"
echo "   3. Monitor Coolify logs for performance metrics"
echo ""
