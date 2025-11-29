#!/bin/bash
# Fast comprehensive chatbot test script

API_URL="${1:-http://localhost:3000}"
API_KEY="tzck_mfuWZAo12CkCi9-AMQOSZAvLW7cDJaUB"

echo "🧪 Testing ChatBot @ $API_URL"
echo "================================"

# Test function
test_query() {
  local name="$1"
  local query="$2"
  local session="test-$(date +%s)-$RANDOM"

  echo -n "[$name] "

  response=$(curl -s -X POST "$API_URL/api/chatkit/agent" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: $API_KEY" \
    -d "{\"message\":\"$query\",\"sessionId\":\"$session\"}" 2>/dev/null)

  if [ $? -ne 0 ]; then
    echo "❌ FAILED (curl error)"
    return 1
  fi

  model=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('model','unknown'))" 2>/dev/null)
  text=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('response',''))" 2>/dev/null)

  if [ -z "$text" ]; then
    echo "❌ FAILED (no response)"
    return 1
  fi

  echo "✅ OK (model: $model, ${#text} chars)"
  echo "$text" | head -c 150
  echo "..."
  echo ""
}

# Run tests in parallel
{
  test_query "Cheap Laptop" "any cheap laptop" &
  test_query "Cheap Phone" "cheap phone" &
  test_query "Gaming Chair" "gaming chair" &
  test_query "PS5 Games" "ps5 games" &
  test_query "Trade-in" "trade in my ps4 for ps5" &
} 2>&1 | grep -v "^$"

wait

echo ""
echo "🔍 Hallucination Check"
echo "======================"

# Check for hallucinations
check_hallucination() {
  local query="$1"
  local session="hallucination-test-$RANDOM"

  response=$(curl -s -X POST "$API_URL/api/chatkit/agent" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: $API_KEY" \
    -d "{\"message\":\"$query\",\"sessionId\":\"$session\"}" 2>/dev/null)

  text=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('response','').lower())" 2>/dev/null)

  echo -n "[$query] "

  if echo "$text" | grep -qE "hades|chorvs|anthem"; then
    echo "❌ HALLUCINATION DETECTED!"
    echo "$text" | grep -oE ".{0,50}(hades|chorvs|anthem).{0,50}"
    return 1
  elif echo "$text" | grep -q '\$40'; then
    echo "⚠️  \$40 found (check if valid)"
    echo "$text" | grep -oE ".{0,30}\$40.{0,30}"
    return 1
  else
    echo "✅ No hallucination"
  fi
}

check_hallucination "cheap laptop"
check_hallucination "affordable phone"
check_hallucination "budget tablet"

echo ""
echo "✅ Tests complete!"
