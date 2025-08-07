-- Check for triggers on chat_logs table
SELECT 
    trigger_name,
    event_manipulation,
    action_statement,
    action_timing
FROM information_schema.triggers 
WHERE event_object_table = 'chat_logs';

-- Also check if chat_sessions table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'chat_sessions';
