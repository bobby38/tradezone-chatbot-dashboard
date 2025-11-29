-- Add metadata and channel columns to chat_logs for voice log visibility
ALTER TABLE public.chat_logs
  ADD COLUMN IF NOT EXISTS metadata jsonb,
  ADD COLUMN IF NOT EXISTS channel text;

-- Backfill channel where missing using source and metadata
UPDATE public.chat_logs
SET channel = COALESCE(channel,
                       CASE
                         WHEN source ILIKE '%voice%' THEN 'voice'
                         WHEN (metadata->>'channel') IS NOT NULL THEN metadata->>'channel'
                         ELSE 'text'
                       END);

-- Helpful index for channel filtering in dashboard
CREATE INDEX IF NOT EXISTS idx_chat_logs_channel_created
  ON public.chat_logs (channel, created_at DESC);
