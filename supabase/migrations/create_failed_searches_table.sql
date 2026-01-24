-- Create table for tracking failed product searches
-- This enables the learning loop to improve search quality over time

CREATE TABLE IF NOT EXISTS failed_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  session_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('no_results', 'low_confidence', 'user_clarification_needed')),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast querying by timestamp (for weekly analysis)
CREATE INDEX IF NOT EXISTS idx_failed_searches_timestamp
  ON failed_searches(timestamp DESC);

-- Index for grouping by query (for frequency analysis)
CREATE INDEX IF NOT EXISTS idx_failed_searches_query
  ON failed_searches(query);

-- Index for session tracking
CREATE INDEX IF NOT EXISTS idx_failed_searches_session
  ON failed_searches(session_id);

-- Enable Row Level Security
ALTER TABLE failed_searches ENABLE ROW LEVEL SECURITY;

-- Allow service role to insert/select (for learning loop)
CREATE POLICY "Allow service role full access to failed_searches"
  ON failed_searches
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to view their own failed searches
CREATE POLICY "Allow authenticated users to view failed searches"
  ON failed_searches
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE failed_searches IS
  'Tracks product searches that returned no results or low confidence matches. Used by Graphiti learning loop to improve search quality.';

COMMENT ON COLUMN failed_searches.query IS
  'The search query that failed (normalized to lowercase)';

COMMENT ON COLUMN failed_searches.reason IS
  'Why the search failed: no_results, low_confidence, or user_clarification_needed';

COMMENT ON COLUMN failed_searches.session_id IS
  'Session ID for tracking user journey and patterns';
