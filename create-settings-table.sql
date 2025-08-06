-- Create settings table for persistent storage
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  setting_type TEXT NOT NULL, -- 'ai', 'smtp', 'general'
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, setting_type, setting_key)
);

-- Create an index for faster queries
CREATE INDEX IF NOT EXISTS idx_settings_user_type ON settings(user_id, setting_type);

-- Insert default settings
INSERT INTO settings (user_id, setting_type, setting_key, setting_value) VALUES
('default', 'ai', 'provider', '"openai"'),
('default', 'ai', 'model', '"gpt-4o"'),
('default', 'general', 'config', '{
  "apiTimeout": "30",
  "maxTokens": "2000", 
  "temperature": "0.7",
  "retryAttempts": "3",
  "logLevel": "info",
  "enableAnalytics": true,
  "enableNotifications": true
}'),
('default', 'smtp', 'config', '{
  "fromEmail": "",
  "fromName": "",
  "host": "",
  "port": "587",
  "user": "",
  "pass": "",
  "encryption": "TLS",
  "useAutoTLS": true,
  "authentication": true,
  "forceFromEmail": true,
  "setReturnPath": true,
  "testEmail": "info@rezult.co"
}')
ON CONFLICT (user_id, setting_type, setting_key) DO NOTHING;

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update the updated_at field
DROP TRIGGER IF EXISTS trigger_update_settings_updated_at ON settings;
CREATE TRIGGER trigger_update_settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW
  EXECUTE FUNCTION update_settings_updated_at();
