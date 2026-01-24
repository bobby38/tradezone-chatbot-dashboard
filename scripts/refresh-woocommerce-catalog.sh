#!/bin/bash
# Refresh WooCommerce catalog with Perplexity enrichment

API_KEY="${CHATKIT_API_KEY:-}"
START=$(date +%s)

if [ -z "$API_KEY" ]; then
  echo "Missing CHATKIT_API_KEY"
  exit 1
fi

# Run the actual enrichment script
if cd /app && node scripts/refresh-product-catalog.mjs > /tmp/catalog-refresh.log 2>&1; then
  STATUS="success"
  NOTES="Catalog refreshed with enrichment"
else
  STATUS="failed"
  NOTES="Catalog refresh failed: $(tail -1 /tmp/catalog-refresh.log)"
fi

# Calculate duration and log to dashboard
DURATION=$(( ($(date +%s) - START) * 1000 ))
curl -sS -X POST https://trade.rezult.co/api/scheduled-tasks/ingest \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"task_id\":\"refresh-woocommerce-catalog\",\"task_title\":\"Refresh WooCommerce catalog\",\"status\":\"$STATUS\",\"duration_ms\":$DURATION,\"notes\":\"$NOTES\"}" \
  > /dev/null 2>&1
