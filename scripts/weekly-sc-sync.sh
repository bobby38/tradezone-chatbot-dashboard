#!/usr/bin/env bash
# Weekly GSC → Supabase sync
# Place your secrets in .env.sc (same directory as this script):
#   SUPABASE_URL=...
#   SUPABASE_SERVICE_ROLE_KEY=...
#   GOOGLE_SERVICE_ACCOUNT_KEY=...   # raw JSON of service account key
#   SC_SITE=sc-domain:tradezone.sg

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env.sc"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
else
  echo "[weekly-sc-sync] Missing $ENV_FILE. Create it with required env vars." >&2
  exit 1
fi

# Verify required environment variables
if [[ -z "${SUPABASE_URL:-}" ]]; then
  echo "[weekly-sc-sync] Missing SUPABASE_URL in $ENV_FILE" >&2
  exit 1
fi

if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "[weekly-sc-sync] Missing SUPABASE_SERVICE_ROLE_KEY in $ENV_FILE" >&2
  exit 1
fi

if [[ -z "${GOOGLE_SERVICE_ACCOUNT_KEY:-}" ]]; then
  if [[ -z "${GOOGLE_OAUTH_CLIENT_KEY:-}" || -z "${GOOGLE_OAUTH_REFRESH_TOKEN:-}" ]]; then
    echo "[weekly-sc-sync] Missing authentication credentials in $ENV_FILE" >&2
    echo "[weekly-sc-sync] Set either GOOGLE_SERVICE_ACCOUNT_KEY or both GOOGLE_OAUTH_CLIENT_KEY and GOOGLE_OAUTH_REFRESH_TOKEN" >&2
    exit 1
  fi
fi

# Explicitly pass all environment variables to Node.js
# Node 18+ recommended. Fetch last 35 days to cover weekly gaps.
export SUPABASE_URL
export SUPABASE_SERVICE_ROLE_KEY
export GOOGLE_SERVICE_ACCOUNT_KEY
export GOOGLE_OAUTH_CLIENT_KEY
export GOOGLE_OAUTH_REFRESH_TOKEN

echo "[weekly-sc-sync] Starting sync from ${SC_SITE:-sc-domain:tradezone.sg} to Supabase..."
node "$PROJECT_ROOT/scripts/fetch-sc-to-supabase.js" --site "${SC_SITE:-sc-domain:tradezone.sg}" --range 35
echo "[weekly-sc-sync] Sync completed successfully!"
