# 📋 Scheduler Integration - Quick Start

## What's Been Built

✅ **Supabase Table**: `scheduled_task_runs` stores execution logs  
✅ **Ingest API**: `/api/scheduled-tasks/ingest` accepts POST from cron jobs  
✅ **Dashboard Display**: Settings → Schedulers tab shows real-time data  
✅ **Sample Data**: Pre-populated with historical runs  

## How It Works

```
Coolify Cron Job
    ↓
    POST /api/scheduled-tasks/ingest
    (with execution status)
    ↓
Supabase: scheduled_task_runs table
    ↓
Dashboard: /dashboard/settings → Schedulers tab
    (displays execution history)
```

## Quick Setup (3 Steps)

### 1. Run Database Migration

Go to Supabase Dashboard → SQL Editor and run:
```sql
-- File: supabase/migrations/20260104_scheduled_task_runs.sql
-- This creates the scheduled_task_runs table
```

Or use Supabase CLI:
```bash
supabase db push
```

### 2. Test the Integration

Run the test script:
```bash
./scripts/test-scheduler-ingest.sh
```

This will:
- POST 3 test executions to the API
- You should see success responses
- Check dashboard to verify data appears

### 3. Update Your Cron Jobs

**Option A: Simple (Recommended)**
Add this to the END of each cron job:

```bash
# After your existing curl command, add:
curl -sS -X POST https://trade.rezult.co/api/scheduled-tasks/ingest \
  -H "X-API-Key: YOUR_CHATKIT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"task_id":"tradein-auto-submit","task_title":"Trade-in auto submit","status":"success"}'
```

**Option B: Full Logging (Advanced)**
See: `docs/SCHEDULED_TASKS_INTEGRATION.md`

## Example: Update tradein-auto-submit

**Before:**
```bash
*/1 * * * * curl -sS -X POST https://tradezone.sg/api/tradein/auto-submit \
  -H "X-API-Key: YOUR_CHATKIT_API_KEY"
```

**After:**
```bash
*/1 * * * * curl -sS -X POST https://tradezone.sg/api/tradein/auto-submit \
  -H "X-API-Key: YOUR_CHATKIT_API_KEY" && \
  curl -sS -X POST https://trade.rezult.co/api/scheduled-tasks/ingest \
  -H "X-API-Key: YOUR_CHATKIT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"task_id":"tradein-auto-submit","task_title":"Trade-in auto submit","status":"success"}'
```

## Task IDs Reference

| Task ID | Title | Current Schedule |
|---------|-------|------------------|
| `sync-price-grid` | Sync price grid | Weekly (Sun 10:00 AM) |
| `refresh-woocommerce-catalog` | Refresh WooCommerce catalog | Weekly (Sun 10:05 AM) |
| `graphiti-sync` | Graphiti enrichment | Weekly (Sun 10:30 AM) |
| `tradein-auto-submit` | Trade-in auto submit | Every minute |
| `tradein-email-retry` | Trade-in email retry | Every 5 minutes |

## Verify It's Working

1. Go to: https://trade.rezult.co/dashboard/settings
2. Click: **Schedulers** tab
3. You should see:
   - Task cards (like the screenshot)
   - Recent executions
   - Success/Failed status
   - Duration and timestamps
4. Click **Refresh** to get latest data

## Files Created

```
supabase/migrations/20260104_scheduled_task_runs.sql  ← Database table
app/api/scheduled-tasks/ingest/route.ts               ← POST endpoint
app/api/scheduled-tasks/route.ts                      ← Updated to read from Supabase
docs/SCHEDULED_TASKS_INTEGRATION.md                   ← Full documentation
scripts/test-scheduler-ingest.sh                      ← Test script
```

## Troubleshooting

**Dashboard shows "No scheduled tasks found"**
- Run the migration first
- Run test script to add sample data
- Check Supabase table has data: `SELECT * FROM scheduled_task_runs`

**401 Unauthorized when testing**
- Check API key matches `CHATKIT_API_KEY` env variable
- Verify header: `X-API-Key: YOUR_CHATKIT_API_KEY`

**Cron job not logging**
- Check cron job is executing (look at Coolify logs)
- Verify network access from Coolify to dashboard
- Test manually with curl from Coolify container

## Next Steps

1. ✅ Run migration on production Supabase
2. ✅ Test the ingest endpoint
3. ✅ Verify dashboard displays test data
4. ⏳ Update 1 cron job as a pilot
5. ⏳ Monitor for 24 hours
6. ⏳ Roll out to all cron jobs

## Need Help?

See full documentation: `docs/SCHEDULED_TASKS_INTEGRATION.md`
