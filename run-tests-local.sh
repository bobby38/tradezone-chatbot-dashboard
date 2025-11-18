#!/bin/bash
# Quick test runner for local development

export CHATKIT_API_KEY="tzck_mfuWZAo12CkCi9-AMQOSZAvLW7cDJaUB"
export API_BASE_URL="http://localhost:3001"

echo "🧪 Running tests against: $API_BASE_URL"
echo ""

npx playwright test product-family-filtering.spec.ts --project=chromium --reporter=list --timeout=30000
