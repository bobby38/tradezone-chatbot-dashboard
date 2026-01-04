#!/bin/bash
# Cron Job Wrapper with Dashboard Logging
#
# Usage:
#   ./cron-wrapper.sh TASK_ID "Task Title" "command to run"
#
# Example:
#   ./cron-wrapper.sh tradein-auto-submit "Trade-in auto submit" \
#     "curl -X POST https://tradezone.sg/api/tradein/auto-submit -H 'X-API-Key: xxx'"

set -e

# Configuration
API_KEY="${CHATKIT_API_KEY:-tzck_mfuWZAo12CkCi9-AMQOSZAvLW7cDJaUB}"
DASHBOARD_URL="${DASHBOARD_URL:-https://trade.rezult.co}"

# Arguments
TASK_ID="$1"
TASK_TITLE="$2"
COMMAND="$3"

if [ -z "$TASK_ID" ] || [ -z "$TASK_TITLE" ] || [ -z "$COMMAND" ]; then
  echo "Usage: $0 TASK_ID 'Task Title' 'command to run'"
  exit 1
fi

# Record start time
START_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
START_MS=$(date +%s%3N 2>/dev/null || echo $(($(date +%s) * 1000)))

# Execute command and capture result
set +e
OUTPUT=$(eval "$COMMAND" 2>&1)
EXIT_CODE=$?
set -e

# Record end time
END_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
END_MS=$(date +%s%3N 2>/dev/null || echo $(($(date +%s) * 1000)))
DURATION=$((END_MS - START_MS))

# Determine status
if [ $EXIT_CODE -eq 0 ]; then
  STATUS="success"
  NOTES=""
else
  STATUS="failed"
  NOTES="Exit code: $EXIT_CODE. Output: ${OUTPUT:0:200}"
fi

# Post to dashboard
PAYLOAD=$(cat <<EOF
{
  "task_id": "$TASK_ID",
  "task_title": "$TASK_TITLE",
  "status": "$STATUS",
  "started_at": "$START_TIME",
  "ended_at": "$END_TIME",
  "duration_ms": $DURATION,
  "notes": $(echo -n "$NOTES" | jq -R .)
}
EOF
)

curl -sS -X POST "$DASHBOARD_URL/api/scheduled-tasks/ingest" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" > /dev/null 2>&1 || true

# Exit with original exit code
exit $EXIT_CODE
