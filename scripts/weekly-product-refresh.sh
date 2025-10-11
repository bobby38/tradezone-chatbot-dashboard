#!/usr/bin/env bash
set -euo pipefail

# Weekly Product Catalog Refresh Script
# Fetches all products from WooCommerce and updates the JSON catalog

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "[$(date)] Starting weekly product catalog refresh..."

cd "$PROJECT_ROOT"

# Run the refresh script
node scripts/refresh-product-catalog.mjs

echo "[$(date)] Product catalog refresh completed successfully"
