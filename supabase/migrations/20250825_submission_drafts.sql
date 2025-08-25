-- Create table for storing AI-generated reply drafts
CREATE TABLE IF NOT EXISTS submission_drafts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  sent BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMP WITH TIME ZONE,
  sent_by TEXT, -- email address of sender
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_submission_drafts_submission_id ON submission_drafts(submission_id);
CREATE INDEX IF NOT EXISTS idx_submission_drafts_sent ON submission_drafts(sent);
CREATE INDEX IF NOT EXISTS idx_submission_drafts_created_at ON submission_drafts(created_at DESC);

-- Enable RLS
ALTER TABLE submission_drafts ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
CREATE POLICY "Allow authenticated users to manage submission drafts" ON submission_drafts
  FOR ALL USING (true);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_submission_drafts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER submission_drafts_updated_at
  BEFORE UPDATE ON submission_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_submission_drafts_updated_at();