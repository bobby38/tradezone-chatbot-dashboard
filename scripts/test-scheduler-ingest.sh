#!/bin/bash
# Test script for scheduled task ingestion endpoint
# Usage: ./scripts/test-scheduler-ingest.sh

set -e

API_KEY="${CHATKIT_API_KEY:-tzck_mfuWZAo12CkCi9-AMQOSZAvLW7cDJaUB}"
DASHBOARD_URL="${DASHBOARD_URL:-https://trade.rezult.co}"

echo "🧪 Testing Scheduled Tasks Ingest Endpoint"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 1: Successful task execution
echo "Test 1: POST successful task execution"
RESPONSE=$(curl -s -X POST "$DASHBOARD_URL/api/scheduled-tasks/ingest" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": "test-success",
    "task_title": "Test Success Task",
    "status": "success",
    "duration_ms": 1234,
    "notes": "Test execution - all systems operational"
  }')

echo "Response: $RESPONSE"
echo ""

# Test 2: Failed task execution
echo "Test 2: POST failed task execution"
RESPONSE=$(curl -s -X POST "$DASHBOARD_URL/api/scheduled-tasks/ingest" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": "test-failure",
    "task_title": "Test Failure Task",
    "status": "failed",
    "duration_ms": 5678,
    "notes": "Test execution - simulated failure"
  }')

echo "Response: $RESPONSE"
echo ""

# Test 3: Real task (tradein-auto-submit)
echo "Test 3: POST real task execution"
RESPONSE=$(curl -s -X POST "$DASHBOARD_URL/api/scheduled-tasks/ingest" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"task_id\": \"tradein-auto-submit\",
    \"task_title\": \"Trade-in auto submit\",
    \"status\": \"success\",
    \"started_at\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",
    \"duration_ms\": 2000,
    \"notes\": \"Manual test run\"
  }")

echo "Response: $RESPONSE"
echo ""

echo "✅ Tests completed!"
echo ""
echo "Next steps:"
echo "1. Go to $DASHBOARD_URL/dashboard/settings"
echo "2. Click 'Schedulers' tab"
echo "3. Click 'Refresh' to see the test tasks"
echo ""
echo "You should see:"
echo "  - test-success (success)"
echo "  - test-failure (failed)"
echo "  - tradein-auto-submit (success)"
