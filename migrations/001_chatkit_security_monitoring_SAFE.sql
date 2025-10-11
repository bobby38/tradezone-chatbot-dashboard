-- ChatKit Security & Monitoring Tables Migration (SAFE VERSION)
-- Run this in your Supabase SQL Editor
-- This version avoids DROP statements that trigger warnings

-- ============================================
-- 1. Usage Metrics Table
-- ============================================
CREATE TABLE IF NOT EXISTS chat_usage_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  estimated_cost DECIMAL(10, 6) NOT NULL,
  latency_ms INTEGER NOT NULL,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  client_ip TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 2. Security Events Table
-- ============================================
CREATE TABLE IF NOT EXISTS chat_security_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('high_usage', 'repeated_errors', 'rate_limit_hit', 'auth_failure')),
  session_id TEXT,
  client_ip TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 3. Indexes for Performance
-- ============================================

-- Usage metrics indexes
CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON chat_usage_metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_usage_session ON chat_usage_metrics(session_id);
CREATE INDEX IF NOT EXISTS idx_usage_client_ip ON chat_usage_metrics(client_ip);
CREATE INDEX IF NOT EXISTS idx_usage_endpoint ON chat_usage_metrics(endpoint);
CREATE INDEX IF NOT EXISTS idx_usage_model ON chat_usage_metrics(model);
CREATE INDEX IF NOT EXISTS idx_usage_success ON chat_usage_metrics(success);

-- Security events indexes
CREATE INDEX IF NOT EXISTS idx_security_timestamp ON chat_security_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_type ON chat_security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_client_ip ON chat_security_events(client_ip);
CREATE INDEX IF NOT EXISTS idx_security_endpoint ON chat_security_events(endpoint);
CREATE INDEX IF NOT EXISTS idx_security_session ON chat_security_events(session_id);

-- ============================================
-- 4. Enable Row Level Security (RLS)
-- ============================================
ALTER TABLE chat_usage_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_security_events ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. RLS Policies (Create only if not exists)
-- ============================================

-- Service role has full access to usage metrics
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'chat_usage_metrics'
    AND policyname = 'Service role full access to usage metrics'
  ) THEN
    CREATE POLICY "Service role full access to usage metrics"
      ON chat_usage_metrics
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Service role has full access to security events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'chat_security_events'
    AND policyname = 'Service role full access to security events'
  ) THEN
    CREATE POLICY "Service role full access to security events"
      ON chat_security_events
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Authenticated users can read usage metrics
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'chat_usage_metrics'
    AND policyname = 'Authenticated users read usage metrics'
  ) THEN
    CREATE POLICY "Authenticated users read usage metrics"
      ON chat_usage_metrics
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- Authenticated users can read security events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'chat_security_events'
    AND policyname = 'Authenticated users read security events'
  ) THEN
    CREATE POLICY "Authenticated users read security events"
      ON chat_security_events
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- ============================================
-- 6. Materialized Views for Analytics
-- ============================================

-- Daily usage summary view
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_usage_summary AS
SELECT
  DATE(timestamp) as date,
  endpoint,
  model,
  COUNT(*) as total_requests,
  SUM(total_tokens) as total_tokens,
  SUM(estimated_cost) as total_cost,
  AVG(latency_ms) as avg_latency_ms,
  SUM(CASE WHEN success THEN 1 ELSE 0 END)::FLOAT / COUNT(*) * 100 as success_rate
FROM chat_usage_metrics
GROUP BY DATE(timestamp), endpoint, model
ORDER BY date DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_summary_unique ON daily_usage_summary(date, endpoint, model);

-- Hourly usage summary view
CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_usage_summary AS
SELECT
  DATE_TRUNC('hour', timestamp) as hour,
  endpoint,
  COUNT(*) as total_requests,
  SUM(total_tokens) as total_tokens,
  SUM(estimated_cost) as total_cost,
  AVG(latency_ms) as avg_latency_ms
FROM chat_usage_metrics
GROUP BY DATE_TRUNC('hour', timestamp), endpoint
ORDER BY hour DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hourly_summary_unique ON hourly_usage_summary(hour, endpoint);

-- Top IPs by usage
CREATE MATERIALIZED VIEW IF NOT EXISTS top_ips_by_usage AS
SELECT
  client_ip,
  COUNT(*) as request_count,
  SUM(total_tokens) as total_tokens,
  SUM(estimated_cost) as total_cost,
  MAX(timestamp) as last_seen
FROM chat_usage_metrics
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY client_ip
ORDER BY request_count DESC
LIMIT 100;

CREATE UNIQUE INDEX IF NOT EXISTS idx_top_ips_unique ON top_ips_by_usage(client_ip);

-- ============================================
-- 7. Refresh Functions for Materialized Views
-- ============================================

-- Function to refresh all materialized views
CREATE OR REPLACE FUNCTION refresh_usage_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY daily_usage_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY hourly_usage_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY top_ips_by_usage;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 8. Cleanup Function for Old Data
-- ============================================

-- Function to delete metrics older than 90 days
CREATE OR REPLACE FUNCTION cleanup_old_metrics()
RETURNS void AS $$
BEGIN
  DELETE FROM chat_usage_metrics
  WHERE timestamp < NOW() - INTERVAL '90 days';

  DELETE FROM chat_security_events
  WHERE timestamp < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 9. Helper Functions
-- ============================================

-- Get usage summary for a date range
CREATE OR REPLACE FUNCTION get_usage_summary(
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ
)
RETURNS TABLE (
  total_requests BIGINT,
  total_tokens BIGINT,
  total_cost NUMERIC,
  avg_latency NUMERIC,
  error_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_requests,
    SUM(total_tokens)::BIGINT as total_tokens,
    SUM(estimated_cost)::NUMERIC as total_cost,
    AVG(latency_ms)::NUMERIC as avg_latency,
    (SUM(CASE WHEN NOT success THEN 1 ELSE 0 END)::FLOAT / COUNT(*) * 100)::NUMERIC as error_rate
  FROM chat_usage_metrics
  WHERE timestamp >= start_date AND timestamp <= end_date;
END;
$$ LANGUAGE plpgsql;

-- Get suspicious IPs (high rate limit hits)
CREATE OR REPLACE FUNCTION get_suspicious_ips(
  lookback_hours INTEGER DEFAULT 24,
  min_events INTEGER DEFAULT 10
)
RETURNS TABLE (
  client_ip TEXT,
  event_count BIGINT,
  event_types TEXT[],
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cse.client_ip,
    COUNT(*)::BIGINT as event_count,
    ARRAY_AGG(DISTINCT cse.event_type) as event_types,
    MIN(cse.timestamp) as first_seen,
    MAX(cse.timestamp) as last_seen
  FROM chat_security_events cse
  WHERE cse.timestamp > NOW() - (lookback_hours || ' hours')::INTERVAL
  GROUP BY cse.client_ip
  HAVING COUNT(*) >= min_events
  ORDER BY event_count DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 10. Grant Permissions
-- ============================================

-- Grant execute on functions to authenticated users
GRANT EXECUTE ON FUNCTION get_usage_summary TO authenticated;
GRANT EXECUTE ON FUNCTION get_suspicious_ips TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_usage_views TO authenticated;

-- Grant select on materialized views
GRANT SELECT ON daily_usage_summary TO authenticated;
GRANT SELECT ON hourly_usage_summary TO authenticated;
GRANT SELECT ON top_ips_by_usage TO authenticated;

-- ============================================
-- Migration Complete ✅
-- ============================================

-- Verify tables were created
DO $$
DECLARE
  table_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name IN ('chat_usage_metrics', 'chat_security_events');

  IF table_count = 2 THEN
    RAISE NOTICE '✅ Migration completed successfully! Created % tables.', table_count;
  ELSE
    RAISE WARNING '⚠️  Expected 2 tables, found %. Please check the migration.', table_count;
  END IF;
END $$;

-- Display created tables
SELECT
  '✅ ' || table_name as status,
  pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as size
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('chat_usage_metrics', 'chat_security_events')
ORDER BY table_name;
