#!/usr/bin/env bash
# Weekly GSC → Supabase sync
# Place your secrets in .env.sc (same directory as this script):
#   SUPABASE_URL=...
#   SUPABASE_SERVICE_ROLE_KEY=...
#   GOOGLE_OAUTH_CLIENT_KEY=...   # raw JSON or base64
#   GOOGLE_OAUTH_REFRESH_TOKEN=...
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

# Node 18+ recommended. Fetch last 35 days to cover weekly gaps.
node "$PROJECT_ROOT/scripts/fetch-sc-to-supabase.js" --site "${SC_SITE:-sc-domain:tradezone.sg}" --range 35
