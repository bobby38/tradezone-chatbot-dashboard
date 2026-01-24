# Scheduled Tasks Integration Guide

This guide explains how to connect your Coolify cron jobs to the TradeZone dashboard's Schedulers tab.

## Overview

The dashboard displays real-time scheduled task execution logs by:
1. Cron jobs POST their results to `/api/scheduled-tasks/ingest`
2. Results are stored in Supabase `scheduled_task_runs` table
3. Dashboard reads from Supabase and displays execution history

## Setup Steps

### 1. Run the Database Migration

First, apply the migration to create the `scheduled_task_runs` table:

```bash
# If using Supabase CLI locally
supabase db push

# Or run the SQL directly in Supabase Dashboard SQL Editor
# File: supabase/migrations/20260104_scheduled_task_runs.sql
```

### 2. Update Your Cron Jobs

Modify each cron job to POST results after execution. Here's the pattern:

#### Before (Current):
```bash
# Coolify cron job
*/1 * * * * curl -sS -X POST https://tradezone.sg/api/tradein/auto-submit \
  -H "X-API-Key: YOUR_CHATKIT_API_KEY"
```

#### After (With Logging):
```bash
#!/bin/bash
# Coolify cron job with dashboard logging

TASK_ID="tradein-auto-submit"
TASK_TITLE="Trade-in auto submit"
API_KEY="YOUR_CHATKIT_API_KEY"
DASHBOARD_URL="https://trade.rezult.co"

# Record start time
START_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
START_MS=$(date +%s%3N)

# Execute the actual task
RESPONSE=$(curl -sS -w "\n%{http_code}" -X POST https://tradezone.sg/api/tradein/auto-submit \
  -H "X-API-Key: $API_KEY" 2>&1)

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$RESPONSE" | sed '$d')

# Record end time and calculate duration
END_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
END_MS=$(date +%s%3N)
DURATION=$((END_MS - START_MS))

# Determine status
if [ "$HTTP_CODE" = "200" ]; then
  STATUS="success"
  NOTES=""
else
  STATUS="failed"
  NOTES="HTTP $HTTP_CODE: $RESPONSE_BODY"
fi

# Post results to dashboard
curl -sS -X POST "$DASHBOARD_URL/api/scheduled-tasks/ingest" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"task_id\": \"$TASK_ID\",
    \"task_title\": \"$TASK_TITLE\",
    \"status\": \"$STATUS\",
    \"started_at\": \"$START_TIME\",
    \"ended_at\": \"$END_TIME\",
    \"duration_ms\": $DURATION,
    \"notes\": \"$NOTES\"
  }"
```

### 3. Simplified Version (For Quick Setup)

If the above is too complex, use this simpler approach:

```bash
#!/bin/bash
# Simple cron job logging

API_KEY="YOUR_CHATKIT_API_KEY"
START=$(date +%s)

# Run your task
if curl -sS -X POST https://tradezone.sg/api/tradein/auto-submit \
  -H "X-API-Key: $API_KEY" > /dev/null 2>&1; then
  STATUS="success"
else
  STATUS="failed"
fi

# Log to dashboard
DURATION=$(( ($(date +%s) - START) * 1000 ))
curl -sS -X POST https://trade.rezult.co/api/scheduled-tasks/ingest \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"task_id\":\"tradein-auto-submit\",\"task_title\":\"Trade-in auto submit\",\"status\":\"$STATUS\",\"duration_ms\":$DURATION}"
```

## Cron Job Task IDs

Use these exact `task_id` values to match the dashboard metadata:

| Task ID | Title | Frequency |
|---------|-------|-----------|
| `sync-price-grid` | Sync price grid | Weekly (Sunday 10:00 AM SGT) |
| `refresh-woocommerce-catalog` | Refresh WooCommerce catalog | Weekly (Sunday 10:05 AM SGT) |
| `graphiti-sync` | Graphiti enrichment | Weekly (Sunday 10:30 AM SGT) |
| `tradein-auto-submit` | Trade-in auto submit | Every minute |
| `tradein-email-retry` | Trade-in email retry | Every 5 minutes |

## API Endpoint Reference

### POST /api/scheduled-tasks/ingest

Records a scheduled task execution.

**Headers:**
- `X-API-Key`: Your ChatKit API key (required)
- `Content-Type`: application/json

**Request Body:**
```json
{
  "task_id": "tradein-auto-submit",
  "task_title": "Trade-in auto submit",
  "status": "success",
  "started_at": "2026-01-04T10:00:00Z",
  "ended_at": "2026-01-04T10:00:05Z",
  "duration_ms": 5000,
  "log_url": "https://logs.example.com/...",
  "notes": "Optional error message or details"
}
```

**Required Fields:**
- `task_id` - Unique identifier matching the table above
- `task_title` - Human-readable task name
- `status` - One of: `success`, `failed`, `running`

**Optional Fields:**
- `started_at` - ISO 8601 timestamp (defaults to now)
- `ended_at` - ISO 8601 timestamp (auto-set if not provided)
- `duration_ms` - Execution time in milliseconds
- `log_url` - Link to full logs (Coolify log viewer)
- `notes` - Error details, warnings, or additional info
- `environment` - Defaults to "production"
- `owner` - Defaults to "Coolify Cron"

**Response:**
```json
{
  "success": true,
  "message": "Task execution logged successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "task_id": "tradein-auto-submit",
    "status": "success",
    "started_at": "2026-01-04T10:00:00Z"
  }
}
```

## Testing

### Manual Test
```bash
curl -X POST https://trade.rezult.co/api/scheduled-tasks/ingest \
  -H "X-API-Key: YOUR_CHATKIT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": "test-task",
    "task_title": "Test Task",
    "status": "success",
    "duration_ms": 1234,
    "notes": "Manual test from CLI"
  }'
```

Expected response:
```json
{"success":true,"message":"Task execution logged successfully","data":{...}}
```

### Verify in Dashboard
1. Go to https://trade.rezult.co/dashboard/settings
2. Click "Schedulers" tab
3. You should see your test task appear
4. Click "Refresh" to reload the latest data

## Troubleshooting

### "Unauthorized" Error
- Check that `X-API-Key` header matches `CHATKIT_API_KEY` environment variable
- Verify the header is being sent correctly

### "Missing required fields" Error
- Ensure `task_id`, `task_title`, and `status` are all present
- Check JSON is valid (use `jq` to validate)

### Task Not Appearing in Dashboard
- Check Supabase logs for errors
- Verify the migration was run successfully
- Confirm RLS policies allow reading the table

### Need Help?
- Check application logs: `/dashboard/settings` → "Bot Logs" tab
- Review Supabase table: Query `scheduled_task_runs` directly
- Test the endpoint manually with curl

## Migration to Production

1. **Apply Migration**
   ```sql
   -- Run in Supabase Dashboard SQL Editor
   -- File: supabase/migrations/20260104_scheduled_task_runs.sql
   ```

2. **Update Environment Variables** (if needed)
   - Ensure `CHATKIT_API_KEY` is set in production
   - Verify `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`

3. **Update Coolify Cron Jobs**
   - Add logging wrapper to each scheduled task
   - Use the simplified version for quick setup
   - Test each job manually before relying on automatic execution

4. **Monitor Dashboard**
   - Check Schedulers tab daily
   - Set up alerts for failed tasks (future enhancement)
   - Review execution patterns weekly

## Future Enhancements

- [ ] Email alerts when tasks fail
- [ ] Slack/Discord webhooks for failed executions
- [ ] Task execution trends and analytics
- [ ] Auto-retry failed tasks
- [ ] Log retention policies
