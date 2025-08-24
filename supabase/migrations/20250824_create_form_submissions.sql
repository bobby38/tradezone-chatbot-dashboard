-- Create form_submissions table for Fluent Forms webhook
CREATE TABLE IF NOT EXISTS form_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  form_type TEXT NOT NULL, -- 'contact' or 'trade-in'
  form_id TEXT NOT NULL,   -- Fluent Forms form ID
  form_data JSONB NOT NULL, -- All form field data
  source TEXT DEFAULT 'fluent-forms',
  status TEXT DEFAULT 'pending', -- 'pending', 'reviewed', 'responded'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_form_submissions_created_at ON form_submissions(created_at);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form_type ON form_submissions(form_type);
CREATE INDEX IF NOT EXISTS idx_form_submissions_status ON form_submissions(status);

-- Enable RLS
ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users to view all submissions
CREATE POLICY "Allow authenticated users to view form submissions" ON form_submissions
  FOR SELECT USING (auth.role() = 'authenticated');

-- Create policy to allow webhook to insert submissions
CREATE POLICY "Allow webhook to insert form submissions" ON form_submissions
  FOR INSERT WITH CHECK (true);