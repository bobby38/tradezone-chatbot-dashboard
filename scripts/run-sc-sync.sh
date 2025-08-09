#!/usr/bin/env bash
# Helper script to run the Search Console sync with direct environment variables
# This avoids issues with environment variable parsing in the weekly-sc-sync.sh script

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SA_KEY_FILE="$PROJECT_ROOT/tradezone-analytics-n8n-project.json"
ENV_FILE="$PROJECT_ROOT/.env.sc"

# Source the .env.sc file for Supabase credentials
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
else
  echo "[run-sc-sync] Missing $ENV_FILE. Create it with required env vars." >&2
  exit 1
fi

# Check if service account key file exists
if [[ ! -f "$SA_KEY_FILE" ]]; then
  echo "[run-sc-sync] Missing service account key file: $SA_KEY_FILE" >&2
  exit 1
fi

# Check required Supabase environment variables
if [[ -z "${SUPABASE_URL:-}" ]]; then
  echo "[run-sc-sync] Missing SUPABASE_URL in $ENV_FILE" >&2
  exit 1
fi

if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "[run-sc-sync] Missing SUPABASE_SERVICE_ROLE_KEY in $ENV_FILE" >&2
  exit 1
fi

# Run the fetch script with direct environment variables
echo "[run-sc-sync] Starting sync from ${SC_SITE:-sc-domain:tradezone.sg} to Supabase..."
GOOGLE_SERVICE_ACCOUNT_KEY="$(cat "$SA_KEY_FILE")" \
  SUPABASE_URL="$SUPABASE_URL" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  node "$PROJECT_ROOT/scripts/fetch-sc-to-supabase.js" \
  --site "${SC_SITE:-sc-domain:tradezone.sg}" \
  --range 35

echo "[run-sc-sync] Sync completed successfully!"
