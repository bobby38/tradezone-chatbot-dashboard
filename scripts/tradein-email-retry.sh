#!/bin/bash
# Trade-in email retry cron job with dashboard logging

API_KEY="${CHATKIT_API_KEY:-}"
START=$(date +%s)

if [ -z "$API_KEY" ]; then
  echo "Missing CHATKIT_API_KEY"
  exit 1
fi

# Run the actual task
if curl -sS -X POST https://trade.rezult.co/api/tradein/email-retry \
  -H "X-API-Key: $API_KEY" > /dev/null 2>&1; then
  STATUS="success"
else
  STATUS="failed"
fi

# Calculate duration and log to dashboard
DURATION=$(( ($(date +%s) - START) * 1000 ))
curl -sS -X POST https://trade.rezult.co/api/scheduled-tasks/ingest \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"task_id\":\"tradein-email-retry\",\"task_title\":\"Trade-in email retry\",\"status\":\"$STATUS\",\"duration_ms\":$DURATION}" \
  > /dev/null 2>&1
