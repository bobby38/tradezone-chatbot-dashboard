-- Enhanced Chat Sessions Schema
-- Run this in your Supabase SQL Editor to improve session management

-- 1. Add session-related columns to existing chat_logs table
ALTER TABLE chat_logs 
ADD COLUMN IF NOT EXISTS user_id TEXT,
ADD COLUMN IF NOT EXISTS session_id TEXT DEFAULT gen_random_uuid()::text,
ADD COLUMN IF NOT EXISTS session_name TEXT,
ADD COLUMN IF NOT EXISTS turn_index INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS processing_time NUMERIC,
ADD COLUMN IF NOT EXISTS user_ip TEXT,
ADD COLUMN IF NOT EXISTS user_agent TEXT,
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'n8n';

-- 2. Create chat_sessions table for better session management
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

-- 3. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_chat_logs_session_id ON chat_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_logs_user_id ON chat_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_logs_created_at ON chat_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_session_id ON chat_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_last_activity ON chat_sessions(last_activity);

-- 4. Create function to auto-update session activity
CREATE OR REPLACE FUNCTION update_session_activity()
RETURNS TRIGGER AS $$
BEGIN
  -- Update session last_activity and increment message count
  UPDATE chat_sessions 
  SET 
    last_activity = NOW(),
    total_messages = total_messages + 1,
    updated_at = NOW()
  WHERE session_id = NEW.session_id;
  
  -- If session doesn't exist, create it
  IF NOT FOUND THEN
    INSERT INTO chat_sessions (
      session_id, 
      user_id, 
      session_name,
      started_at,
      last_activity,
      total_messages,
      source,
      user_ip,
      user_agent
    ) VALUES (
      NEW.session_id,
      NEW.user_id,
      COALESCE(NEW.session_name, 'Chat Session ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI')),
      NOW(),
      NOW(),
      1,
      COALESCE(NEW.source, 'n8n'),
      NEW.user_ip,
      NEW.user_agent
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger to auto-update session activity
DROP TRIGGER IF EXISTS trigger_update_session_activity ON chat_logs;
CREATE TRIGGER trigger_update_session_activity
  AFTER INSERT ON chat_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_session_activity();

-- 6. Create function to generate session names based on first message
CREATE OR REPLACE FUNCTION generate_session_name(first_prompt TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Extract first few words from prompt for session name
  RETURN CASE 
    WHEN LENGTH(first_prompt) > 50 THEN 
      SUBSTRING(first_prompt FROM 1 FOR 47) || '...'
    ELSE 
      first_prompt
  END;
END;
$$ LANGUAGE plpgsql;

-- 7. Update existing chat_logs to have proper session_ids
-- Group existing logs by user_id and timestamp proximity (within 1 hour = same session)
DO $$
DECLARE
  log_record RECORD;
  current_session_id UUID;
  last_user_id TEXT := '';
  last_timestamp TIMESTAMPTZ;
  session_gap_hours INTEGER := 1; -- Consider new session if gap > 1 hour
BEGIN
  -- Process logs in chronological order
  FOR log_record IN 
    SELECT id, user_id, created_at, prompt
    FROM chat_logs 
    WHERE session_id IS NULL 
    ORDER BY user_id, created_at
  LOOP
    -- Check if we need a new session
    IF log_record.user_id != last_user_id OR 
       last_timestamp IS NULL OR 
       (log_record.created_at - last_timestamp) > INTERVAL '1 hour' THEN
      
      -- Generate new session ID
      current_session_id := gen_random_uuid();
      
      -- Create session record
      INSERT INTO chat_sessions (
        session_id,
        user_id,
        session_name,
        started_at,
        last_activity,
        total_messages,
        source
      ) VALUES (
        current_session_id,
        log_record.user_id,
        generate_session_name(log_record.prompt),
        log_record.created_at,
        log_record.created_at,
        0, -- Will be updated by trigger
        'migrated'
      );
    END IF;
    
    -- Update the log with session_id
    UPDATE chat_logs 
    SET 
      session_id = current_session_id,
      session_name = generate_session_name(log_record.prompt),
      turn_index = (
        SELECT COUNT(*) + 1 
        FROM chat_logs 
        WHERE session_id = current_session_id 
        AND id != log_record.id
      )
    WHERE id = log_record.id;
    
    -- Update tracking variables
    last_user_id := log_record.user_id;
    last_timestamp := log_record.created_at;
  END LOOP;
END $$;

-- 8. Create view for session summaries
CREATE OR REPLACE VIEW session_summaries AS
SELECT 
  s.session_id,
  s.user_id,
  s.session_name,
  s.started_at,
  s.last_activity,
  s.total_messages,
  s.status,
  s.source,
  EXTRACT(EPOCH FROM (s.last_activity - s.started_at)) / 60 as duration_minutes,
  l.first_prompt,
  l.last_prompt,
  COALESCE(l.successful_messages, 0) as successful_messages,
  COALESCE(l.error_messages, 0) as error_messages
FROM chat_sessions s
LEFT JOIN (
  SELECT 
    session_id,
    MIN(CASE WHEN turn_index = 1 THEN prompt END) as first_prompt,
    MAX(CASE WHEN turn_index = (SELECT MAX(turn_index) FROM chat_logs l2 WHERE l2.session_id = chat_logs.session_id) THEN prompt END) as last_prompt,
    COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_messages,
    COUNT(CASE WHEN status = 'error' THEN 1 END) as error_messages
  FROM chat_logs 
  GROUP BY session_id
) l ON s.session_id = l.session_id;

-- 9. Create function to end inactive sessions (optional cleanup)
CREATE OR REPLACE FUNCTION end_inactive_sessions(inactive_hours INTEGER DEFAULT 24)
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE chat_sessions 
  SET 
    status = 'timeout',
    updated_at = NOW()
  WHERE 
    status = 'active' 
    AND last_activity < NOW() - (inactive_hours || ' hours')::INTERVAL;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Success message
SELECT 'Chat session management schema has been successfully enhanced!' as result;
