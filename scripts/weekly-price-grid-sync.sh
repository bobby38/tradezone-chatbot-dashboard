#!/usr/bin/env bash
set -euo pipefail

# Weekly Trade-In Price Grid Sync Script
# Scrapes https://tradezone.sg/trade-page/ and updates Supabase trade_price_grid table

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "[$(date)] Starting weekly trade-in price grid sync..."

cd "$PROJECT_ROOT"

# Ensure environment variables are loaded
if [ ! -f ".env.local" ]; then
  echo "[ERROR] .env.local not found!"
  exit 1
fi

# Run the price grid scraper
npm run grid:sync

echo "[$(date)] Trade-in price grid sync completed successfully"
