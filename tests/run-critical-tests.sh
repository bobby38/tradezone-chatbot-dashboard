#!/bin/bash
# Run Critical Tests - January 18, 2025
# Tests for performance optimizations and family filtering fixes

set -e

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
echo "2. Trade-In Price-First Flow"
echo "3. Performance Optimization (latency & tokens)"
echo "4. API Security & Authentication"
echo ""

# Run tests with detailed output
echo "🚀 Running tests..."
echo ""

# Test 1: Product Family Filtering
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 1: Product Family Filtering"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
npx playwright test product-family-filtering.spec.ts --reporter=list

# Test 2: Trade-In Price-First Flow
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 2: Trade-In Price-First Flow"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
npx playwright test trade-in-price-first.spec.ts --reporter=list

# Test 3: Performance Optimization
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 3: Performance Optimization"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
npx playwright test performance-optimization.spec.ts --reporter=list

# Test 4: API Security
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 4: API Security & Authentication"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
npx playwright test api-security.spec.ts --reporter=list

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All tests completed!"
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
