-- Simple Session Management Migration
-- Run this first to add basic session columns

-- Step 1: Add session columns to existing chat_logs table
ALTER TABLE chat_logs 
ADD COLUMN IF NOT EXISTS user_id TEXT,
ADD COLUMN IF NOT EXISTS session_id TEXT DEFAULT gen_random_uuid()::text,
ADD COLUMN IF NOT EXISTS session_name TEXT,
ADD COLUMN IF NOT EXISTS turn_index INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS processing_time NUMERIC,
ADD COLUMN IF NOT EXISTS user_ip TEXT,
ADD COLUMN IF NOT EXISTS user_agent TEXT,
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'n8n';

-- Step 2: Create chat_sessions table
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  session_name TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity TIMESTAMPTZ DEFAULT NOW(),
  total_messages INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'ended', 'timeout')),
  source TEXT DEFAULT 'n8n',
  user_ip TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 3: Create basic indexes
CREATE INDEX IF NOT EXISTS idx_chat_logs_session_id ON chat_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_logs_user_id ON chat_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_logs_created_at ON chat_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_session_id ON chat_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_last_activity ON chat_sessions(last_activity);

-- Success message
SELECT 'Basic session management schema has been added successfully!' as result;
