-- Optimize database performance based on pg_stat_statements analysis
-- Focus on high-frequency queries to chat_logs and gsc_performance

-- ============================================
-- PART 1: Optimize chat_logs queries
-- ============================================

-- Add composite index for common query pattern: ORDER BY created_at DESC with pagination
-- This will speed up the dashboard's chat history view
CREATE INDEX IF NOT EXISTS idx_chat_logs_created_desc
  ON public.chat_logs (created_at DESC);

-- Add composite index for session-based queries
-- Improves performance when filtering by session_id
CREATE INDEX IF NOT EXISTS idx_chat_logs_session_created
  ON public.chat_logs (session_id, created_at DESC);

-- Add composite index for user-based queries
-- Speeds up queries filtering by user_id
CREATE INDEX IF NOT EXISTS idx_chat_logs_user_created
  ON public.chat_logs (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- ============================================
-- PART 2: Optimize gsc_performance queries
-- ============================================

-- Add composite index for the most common query pattern
-- Speeds up queries filtering by site + date range + ordering by clicks
CREATE INDEX IF NOT EXISTS idx_gsc_perf_site_date_clicks
  ON public.gsc_performance (site, date DESC, clicks DESC)
  WHERE query IS NOT NULL AND query != '';

-- Add covering index for page-based queries
CREATE INDEX IF NOT EXISTS idx_gsc_perf_site_date_page_clicks
  ON public.gsc_performance (site, date DESC, clicks DESC)
  INCLUDE (page, impressions, ctr, position, device, country)
  WHERE page IS NOT NULL AND page != '';

-- ============================================
-- PART 3: Vacuum and Analyze
-- ============================================

-- Update table statistics for better query planning
ANALYZE public.chat_logs;
ANALYZE public.gsc_performance;

-- ============================================
-- PART 4: Optional - Disable unnecessary realtime
-- ============================================

-- If realtime is not needed for these tables, disable it to reduce overhead
-- Uncomment the lines below if you don't need realtime updates

-- ALTER PUBLICATION supabase_realtime DROP TABLE public.chat_logs;
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.gsc_performance;

SELECT 'Performance optimization complete' AS status;
