# Database Migrations

## ⚠️ Supabase Warning Notice

When you run the migration SQL in Supabase, you might see this warning:

```
⚠️ Potential issue detected with your query
Query has destructive operation
Make sure you are not accidentally removing something important.
```

**This is SAFE and expected!** The warning appears because the migration includes:
- `DROP POLICY IF EXISTS` - Safely removes old policies before creating new ones
- `CREATE OR REPLACE FUNCTION` - Updates functions safely

## Which File to Use?

### Option 1: Standard Migration (Recommended)
**File:** `001_chatkit_security_monitoring.sql`

✅ **Pros:**
- Cleaner code
- Handles policy updates correctly
- Industry standard approach

⚠️ **Cons:**
- Triggers Supabase warning (but it's safe!)

**When to use:** If you're comfortable clicking "Confirm" on the Supabase warning

---

### Option 2: Safe Migration (No Warnings)
**File:** `001_chatkit_security_monitoring_SAFE.sql`

✅ **Pros:**
- No Supabase warnings
- Checks if policies exist before creating
- Extra safe

⚠️ **Cons:**
- Slightly more verbose
- Won't update existing policies (skips them)

**When to use:** If you want zero warnings or running migration multiple times

---

## How to Run Migration

### Step 1: Choose Your File
- First time? Use either file (recommend **SAFE** version)
- Re-running? Use **SAFE** version

### Step 2: Open Supabase SQL Editor
1. Go to: https://supabase.com/dashboard/project/jvkmxtbckpfwypnbubdy/sql
2. Click "New Query"

### Step 3: Copy & Paste
1. Open your chosen migration file
2. Copy ALL contents
3. Paste into Supabase SQL Editor

### Step 4: Run
1. Click **"Run"** or press `Ctrl+Enter`
2. If using standard migration: Click **"Confirm"** on warning
3. Wait for completion (30-60 seconds)

### Step 5: Verify
You should see:
```
✅ Migration completed successfully! Created 2 tables.
```

And a table showing:
```
status                       | size
----------------------------|------
✅ chat_usage_metrics       | 8192 bytes
✅ chat_security_events     | 8192 bytes
```

---

## Troubleshooting

### Error: "relation already exists"
**Solution:** Tables already exist. You can either:
1. Use the **SAFE** version (it will skip existing tables)
2. Or drop existing tables first (⚠️ deletes data!):
```sql
DROP TABLE IF EXISTS chat_usage_metrics CASCADE;
DROP TABLE IF EXISTS chat_security_events CASCADE;
```

### Error: "permission denied"
**Solution:** Make sure you're using the Supabase dashboard, not direct psql connection

### Error: "function already exists"
**Solution:** This is fine! The migration uses `CREATE OR REPLACE` which updates functions

### Warning: "destructive operation"
**Solution:** This is expected for the standard migration. Click "Confirm" - it's safe!

---

## What Gets Created?

### Tables (2)
1. **`chat_usage_metrics`** - Tracks every API request
   - Tokens used
   - Cost per request
   - Response times
   - Success/error status

2. **`chat_security_events`** - Logs security incidents
   - Rate limit hits
   - Auth failures
   - High usage alerts
   - Repeated errors

### Indexes (11)
- Optimized for fast queries on timestamp, IP, session, endpoint

### Materialized Views (3)
- `daily_usage_summary` - Daily aggregated metrics
- `hourly_usage_summary` - Hourly patterns
- `top_ips_by_usage` - Top 100 IPs by usage (7 days)

### Functions (4)
- `refresh_usage_views()` - Refresh materialized views
- `cleanup_old_metrics()` - Delete data older than 90 days
- `get_usage_summary(start, end)` - Get metrics for date range
- `get_suspicious_ips(hours, min_events)` - Find suspicious IPs

### RLS Policies (4)
- Service role: Full access to both tables
- Authenticated users: Read-only access to both tables

---

## Post-Migration Checks

### 1. Verify Tables Exist
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('chat_usage_metrics', 'chat_security_events');
```

Expected: 2 rows returned

### 2. Test Writing Data
```sql
INSERT INTO chat_usage_metrics (
  request_id, session_id, endpoint, model,
  prompt_tokens, completion_tokens, total_tokens,
  estimated_cost, latency_ms, client_ip
) VALUES (
  'test-123', 'session-test', '/api/test', 'gpt-4o-mini',
  100, 200, 300,
  0.0001, 1500, '127.0.0.1'
);
```

Expected: "1 row inserted"

### 3. Test Reading Data
```sql
SELECT * FROM chat_usage_metrics LIMIT 1;
```

Expected: Returns your test row

### 4. Test Functions
```sql
SELECT * FROM get_usage_summary(
  NOW() - INTERVAL '1 day',
  NOW()
);
```

Expected: Returns summary (even if 0 requests)

### 5. Clean Up Test Data
```sql
DELETE FROM chat_usage_metrics WHERE request_id = 'test-123';
```

---

## Re-running Migration

**Safe to re-run?** 
- ✅ **SAFE** version: Yes, completely safe
- ⚠️ **Standard** version: Yes, but drops/recreates policies

**When to re-run:**
- Adding new columns
- Updating functions
- Fixing indexes
- Never ran successfully before

**When NOT to re-run:**
- Tables already exist and working
- You have important data (backup first!)
- Just to "make sure" (use test queries instead)

---

## Backup Before Migration (Optional)

If you have existing data in `chat_logs` or similar tables:

```sql
-- Backup existing chat data
CREATE TABLE chat_logs_backup AS 
SELECT * FROM chat_logs;

-- Verify backup
SELECT COUNT(*) FROM chat_logs_backup;
```

---

## Migration Version History

| Version | File | Status | Notes |
|---------|------|--------|-------|
| 1.0.0 | `001_chatkit_security_monitoring.sql` | ✅ Standard | Includes DROP statements |
| 1.0.0 | `001_chatkit_security_monitoring_SAFE.sql` | ✅ Safe | No DROP statements |

---

## Need Help?

**Check:**
1. Supabase project URL is correct
2. You're logged in with correct permissions
3. Using SQL Editor (not Dashboard UI)
4. Copied entire file (not partial)

**Still stuck?**
- Check Supabase logs for detailed error
- Verify service_role key is set in environment
- Try the **SAFE** migration version

---

✅ **Once migration is successful, you're ready to deploy!**

Next step: See `COOLIFY_DEPLOYMENT.md` or `DEPLOYMENT_SUMMARY.md`
