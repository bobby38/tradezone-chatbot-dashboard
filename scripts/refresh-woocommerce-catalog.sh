#!/bin/bash
# Refresh WooCommerce catalog cron job with dashboard logging

API_KEY="tzck_mfuWZAo12CkCi9-AMQOSZAvLW7cDJaUB"
START=$(date +%s)

# Run the actual task
if curl -sS -X POST https://trade.rezult.co/api/woocommerce/refresh-catalog \
  -H "X-API-Key: $API_KEY" > /dev/null 2>&1; then
  STATUS="success"
  NOTES=""
else
  STATUS="failed"
  NOTES="WooCommerce catalog refresh failed"
fi

# Calculate duration and log to dashboard
DURATION=$(( ($(date +%s) - START) * 1000 ))
curl -sS -X POST https://trade.rezult.co/api/scheduled-tasks/ingest \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"task_id\":\"refresh-woocommerce-catalog\",\"task_title\":\"Refresh WooCommerce catalog\",\"status\":\"$STATUS\",\"duration_ms\":$DURATION,\"notes\":\"$NOTES\"}" \
  > /dev/null 2>&1
