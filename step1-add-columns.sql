-- Step 1: Add session columns to existing chat_logs table
-- Run this FIRST, then run step2-create-tables.sql

ALTER TABLE chat_logs 
ADD COLUMN IF NOT EXISTS user_id TEXT,
ADD COLUMN IF NOT EXISTS session_id TEXT DEFAULT gen_random_uuid()::text,
ADD COLUMN IF NOT EXISTS session_name TEXT,
ADD COLUMN IF NOT EXISTS turn_index INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS processing_time NUMERIC,
ADD COLUMN IF NOT EXISTS user_ip TEXT,
ADD COLUMN IF NOT EXISTS user_agent TEXT,
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'n8n';

-- Success message
SELECT 'Columns added to chat_logs table successfully!' as result;
