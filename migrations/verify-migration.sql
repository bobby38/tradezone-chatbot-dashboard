-- ============================================
-- Verify ChatKit Security Migration
-- Run this in Supabase SQL Editor to check everything is working
-- ============================================

-- 1. Check if tables exist
SELECT
  '1. Tables Check' as test,
  CASE
    WHEN COUNT(*) = 2 THEN '✅ PASS - Both tables created'
    ELSE '❌ FAIL - Missing tables'
  END as result,
  COUNT(*) as tables_found
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('chat_usage_metrics', 'chat_security_events');

-- 2. Check table structure
SELECT
  '2. Columns Check' as test,
  table_name,
  COUNT(*) as column_count
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name IN ('chat_usage_metrics', 'chat_security_events')
GROUP BY table_name
ORDER BY table_name;

-- 3. Check indexes
SELECT
  '3. Indexes Check' as test,
  tablename,
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('chat_usage_metrics', 'chat_security_events')
ORDER BY tablename, indexname;

-- 4. Check materialized views
SELECT
  '4. Views Check' as test,
  matviewname as view_name,
  'Created' as status
FROM pg_matviews
WHERE schemaname = 'public'
AND matviewname IN ('daily_usage_summary', 'hourly_usage_summary', 'top_ips_by_usage')
ORDER BY matviewname;

-- 5. Check functions exist
SELECT
  '5. Functions Check' as test,
  routine_name as function_name,
  'Available' as status
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('get_usage_summary', 'get_suspicious_ips', 'refresh_usage_views', 'cleanup_old_metrics')
ORDER BY routine_name;

-- 6. Check RLS is enabled
SELECT
  '6. RLS Check' as test,
  tablename,
  CASE
    WHEN rowsecurity THEN '✅ Enabled'
    ELSE '❌ Disabled'
  END as rls_status
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('chat_usage_metrics', 'chat_security_events');

-- 7. Check RLS policies
SELECT
  '7. Policies Check' as test,
  tablename,
  policyname,
  'Active' as status
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('chat_usage_metrics', 'chat_security_events')
ORDER BY tablename, policyname;

-- 8. Test INSERT (write a test record)
DO $$
BEGIN
  INSERT INTO chat_usage_metrics (
    request_id, session_id, endpoint, model,
    prompt_tokens, completion_tokens, total_tokens,
    estimated_cost, latency_ms, client_ip, timestamp
  ) VALUES (
    'verify-test-' || gen_random_uuid()::text,
    'verify-session',
    '/api/verify',
    'gpt-4o-mini',
    50, 100, 150,
    0.00005, 500, '127.0.0.1',
    NOW()
  );

  RAISE NOTICE '✅ Test INSERT successful';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '❌ Test INSERT failed: %', SQLERRM;
END $$;

-- 9. Test SELECT (read the test record)
SELECT
  '9. Test SELECT' as test,
  COUNT(*) as test_records_found
FROM chat_usage_metrics
WHERE request_id LIKE 'verify-test-%';

-- 10. Test functions
SELECT
  '10. Function Test' as test,
  total_requests,
  total_tokens,
  ROUND(total_cost::numeric, 6) as total_cost
FROM get_usage_summary(
  NOW() - INTERVAL '1 day',
  NOW()
);

-- 11. Clean up test data
DELETE FROM chat_usage_metrics WHERE request_id LIKE 'verify-test-%';

-- ============================================
-- Final Summary
-- ============================================
SELECT
  '📊 MIGRATION SUMMARY' as "═══════════════════════════════════",
  '' as " ";

SELECT
  '✅ Tables' as component,
  COUNT(*)::text || ' / 2 created' as status
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('chat_usage_metrics', 'chat_security_events')

UNION ALL

SELECT
  '✅ Indexes' as component,
  COUNT(*)::text || ' created' as status
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('chat_usage_metrics', 'chat_security_events')

UNION ALL

SELECT
  '✅ Views' as component,
  COUNT(*)::text || ' / 3 created' as status
FROM pg_matviews
WHERE schemaname = 'public'
AND matviewname IN ('daily_usage_summary', 'hourly_usage_summary', 'top_ips_by_usage')

UNION ALL

SELECT
  '✅ Functions' as component,
  COUNT(*)::text || ' / 4 created' as status
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('get_usage_summary', 'get_suspicious_ips', 'refresh_usage_views', 'cleanup_old_metrics')

UNION ALL

SELECT
  '✅ RLS Policies' as component,
  COUNT(*)::text || ' / 4 created' as status
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('chat_usage_metrics', 'chat_security_events');

-- Final message
SELECT
  CASE
    WHEN (SELECT COUNT(*) FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name IN ('chat_usage_metrics', 'chat_security_events')) = 2
    THEN '🎉 MIGRATION SUCCESSFUL! All components created correctly.'
    ELSE '⚠️  MIGRATION INCOMPLETE - Please check the results above.'
  END as "════════════════════════════════════════════════════════════";
