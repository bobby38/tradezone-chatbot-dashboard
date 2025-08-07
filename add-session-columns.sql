-- Add remaining session columns
ALTER TABLE chat_logs ADD COLUMN IF NOT EXISTS session_id TEXT DEFAULT gen_random_uuid()::text;
ALTER TABLE chat_logs ADD COLUMN IF NOT EXISTS session_name TEXT;
ALTER TABLE chat_logs ADD COLUMN IF NOT EXISTS turn_index INTEGER DEFAULT 1;
ALTER TABLE chat_logs ADD COLUMN IF NOT EXISTS processing_time NUMERIC;
ALTER TABLE chat_logs ADD COLUMN IF NOT EXISTS user_ip TEXT;
ALTER TABLE chat_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE chat_logs ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'n8n';
