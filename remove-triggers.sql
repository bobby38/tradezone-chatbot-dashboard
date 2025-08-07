-- Remove triggers that might be referencing chat_sessions
DROP TRIGGER IF EXISTS update_session_activity_trigger ON chat_logs;
DROP TRIGGER IF EXISTS create_session_trigger ON chat_logs;
DROP TRIGGER IF EXISTS session_management_trigger ON chat_logs;

-- Drop any functions that might be causing issues
DROP FUNCTION IF EXISTS update_session_activity();
DROP FUNCTION IF EXISTS create_session_record();
DROP FUNCTION IF EXISTS manage_session();

-- Check what triggers remain
SELECT trigger_name, event_object_table 
FROM information_schema.triggers 
WHERE event_object_table = 'chat_logs';
