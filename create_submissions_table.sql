-- Create submissions table for webhook form submissions
CREATE TABLE IF NOT EXISTS submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  org_id UUID,
  title TEXT,
  content_input TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'Form Submission',
  ai_metadata JSONB DEFAULT '{}',
  status TEXT DEFAULT 'ready',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- Create policy to allow service role inserts (bypasses RLS anyway)
CREATE POLICY "Allow webhook submissions" ON submissions
  FOR INSERT WITH CHECK (content_type = 'Form Submission');

-- Allow public read for authenticated users
CREATE POLICY "Allow authenticated reads" ON submissions
  FOR SELECT USING (true);

-- Insert a test record to verify
INSERT INTO submissions (
  user_id, 
  org_id, 
  title, 
  content_input, 
  content_type, 
  ai_metadata, 
  status
) VALUES (
  gen_random_uuid(),
  gen_random_uuid(),
  'Test submission',
  '{"test": "data"}',
  'Form Submission',
  '{"source": "manual_test"}',
  'ready'
);