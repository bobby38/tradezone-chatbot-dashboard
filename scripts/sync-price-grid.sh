#!/bin/bash
# Sync price grid cron job with dashboard logging

API_KEY="tzck_mfuWZAo12CkCi9-AMQOSZAvLW7cDJaUB"
START=$(date +%s)

# Run the actual task
if curl -sS -X POST https://trade.rezult.co/api/sync-price-grid \
  -H "X-API-Key: $API_KEY" > /dev/null 2>&1; then
  STATUS="success"
  NOTES=""
else
  STATUS="failed"
  NOTES="Price grid sync failed"
fi

# Calculate duration and log to dashboard
DURATION=$(( ($(date +%s) - START) * 1000 ))
curl -sS -X POST https://trade.rezult.co/api/scheduled-tasks/ingest \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"task_id\":\"sync-price-grid\",\"task_title\":\"Sync price grid\",\"status\":\"$STATUS\",\"duration_ms\":$DURATION,\"notes\":\"$NOTES\"}" \
  > /dev/null 2>&1
