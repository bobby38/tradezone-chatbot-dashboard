-- Create scheduled_task_runs table to store cron job execution logs
-- This allows cron jobs to POST their results for dashboard display

CREATE TABLE IF NOT EXISTS public.scheduled_task_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Task identification
  task_id text NOT NULL,
  task_title text NOT NULL,

  -- Execution details
  status text NOT NULL CHECK (status IN ('success', 'failed', 'running')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_ms integer,

  -- Metadata
  log_url text,
  notes text,
  environment text DEFAULT 'production',
  owner text DEFAULT 'Coolify Cron',

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create index for fast queries
CREATE INDEX IF NOT EXISTS idx_scheduled_task_runs_task_id
  ON public.scheduled_task_runs (task_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_scheduled_task_runs_status
  ON public.scheduled_task_runs (status, started_at DESC);

-- Enable RLS
ALTER TABLE public.scheduled_task_runs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read
CREATE POLICY "Allow authenticated users to read scheduled_task_runs"
  ON public.scheduled_task_runs
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow service role to insert/update (for API endpoints)
CREATE POLICY "Allow service role to manage scheduled_task_runs"
  ON public.scheduled_task_runs
  FOR ALL
  TO service_role
  USING (true);

-- Create function to auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_scheduled_task_runs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER update_scheduled_task_runs_updated_at
  BEFORE UPDATE ON public.scheduled_task_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_scheduled_task_runs_updated_at();

-- Insert sample data for existing tasks
INSERT INTO public.scheduled_task_runs (task_id, task_title, status, started_at, ended_at, duration_ms, notes)
VALUES
  ('sync-price-grid', 'Sync price grid', 'success', '2025-12-07 02:00:03+00', '2025-12-07 02:00:08+00', 5000, NULL),
  ('sync-price-grid', 'Sync price grid', 'success', '2025-11-30 02:00:03+00', '2025-11-30 02:00:06+00', 3000, NULL),
  ('refresh-woocommerce-catalog', 'Refresh WooCommerce catalog', 'success', '2025-12-07 02:05:02+00', '2025-12-07 02:05:10+00', 8000, NULL),
  ('refresh-woocommerce-catalog', 'Refresh WooCommerce catalog', 'success', '2025-11-30 02:05:03+00', '2025-11-30 02:05:09+00', 6000, NULL),
  ('refresh-woocommerce-catalog', 'Refresh WooCommerce catalog', 'failed', '2025-11-23 02:05:02+00', '2025-11-23 02:05:15+00', 13000, 'WooCommerce API rate limited (HTTP 429)'),
  ('graphiti-sync', 'Graphiti enrichment', 'success', '2025-12-07 02:30:03+00', '2025-12-07 02:30:21+00', 18000, NULL),
  ('graphiti-sync', 'Graphiti enrichment', 'success', '2025-11-30 02:30:04+00', '2025-11-30 02:30:18+00', 14000, NULL),
  ('graphiti-sync', 'Graphiti enrichment', 'failed', '2025-11-23 02:30:05+00', '2025-11-23 02:30:25+00', 20000, 'Graphiti API 502 — auto-retry scheduled'),
  ('tradein-auto-submit', 'Trade-in auto submit', 'failed', '2026-01-03 16:20:03+00', '2026-01-03 16:20:05+00', 2000, 'curl: (3) URL rejected: Malformed input to a URL function')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.scheduled_task_runs IS 'Stores execution logs for scheduled cron jobs';
COMMENT ON COLUMN public.scheduled_task_runs.task_id IS 'Unique identifier for the task type (e.g., sync-price-grid)';
COMMENT ON COLUMN public.scheduled_task_runs.log_url IS 'Optional URL to view full execution logs';
