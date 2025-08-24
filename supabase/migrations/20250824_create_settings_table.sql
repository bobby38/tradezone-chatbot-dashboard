-- Create settings table for dashboard configuration
CREATE TABLE IF NOT EXISTS settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  setting_type TEXT NOT NULL, -- 'smtp', 'email', 'notification', etc.
  setting_key TEXT NOT NULL,  -- 'host', 'port', 'username', etc.
  setting_value TEXT,         -- The actual setting value
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create unique constraint for user_id + setting_type + setting_key
CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_unique ON settings(user_id, setting_type, setting_key);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_settings_user_type ON settings(user_id, setting_type);

-- Enable RLS
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users to manage settings
CREATE POLICY "Allow authenticated users to manage settings" ON settings
  FOR ALL USING (auth.role() = 'authenticated');