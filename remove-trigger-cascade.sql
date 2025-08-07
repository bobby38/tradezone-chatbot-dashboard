-- Remove the specific trigger that's causing the chat_sessions error
DROP TRIGGER IF EXISTS trigger_update_session_activity ON chat_logs;

-- Drop the function with CASCADE to remove dependencies
DROP FUNCTION IF EXISTS update_session_activity() CASCADE;

-- Check what triggers remain after cleanup
SELECT trigger_name, event_object_table 
FROM information_schema.triggers 
WHERE event_object_table = 'chat_logs';
