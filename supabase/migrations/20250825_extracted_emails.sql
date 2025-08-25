-- Create table for extracted emails from chat logs and form submissions
CREATE TABLE IF NOT EXISTS extracted_emails (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('chat_log', 'form_submission')),
  source_id UUID NOT NULL,
  context TEXT,
  classification VARCHAR(50) NOT NULL DEFAULT 'general_inquiry',
  confidence DECIMAL(3,2) DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  extracted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Unique constraint to prevent duplicates
  UNIQUE(email, source_type, source_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_extracted_emails_email ON extracted_emails(email);
CREATE INDEX IF NOT EXISTS idx_extracted_emails_source ON extracted_emails(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_extracted_emails_classification ON extracted_emails(classification);
CREATE INDEX IF NOT EXISTS idx_extracted_emails_confidence ON extracted_emails(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_extracted_emails_extracted_at ON extracted_emails(extracted_at DESC);

-- Enable RLS
ALTER TABLE extracted_emails ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
CREATE POLICY "Allow authenticated users to manage extracted emails" ON extracted_emails
  FOR ALL USING (true);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_extracted_emails_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER extracted_emails_updated_at
  BEFORE UPDATE ON extracted_emails
  FOR EACH ROW
  EXECUTE FUNCTION update_extracted_emails_updated_at();

-- Create a view for email analytics
CREATE OR REPLACE VIEW email_analytics AS
SELECT 
  DATE(extracted_at) as extraction_date,
  classification,
  source_type,
  COUNT(*) as email_count,
  COUNT(DISTINCT email) as unique_emails,
  AVG(confidence) as avg_confidence,
  MIN(confidence) as min_confidence,
  MAX(confidence) as max_confidence
FROM extracted_emails 
GROUP BY DATE(extracted_at), classification, source_type
ORDER BY extraction_date DESC, email_count DESC;

-- Create function to get top email domains
CREATE OR REPLACE FUNCTION get_top_email_domains(limit_count INT DEFAULT 10)
RETURNS TABLE(domain TEXT, email_count BIGINT, unique_sources BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    SPLIT_PART(email, '@', 2) as domain,
    COUNT(*) as email_count,
    COUNT(DISTINCT source_id) as unique_sources
  FROM extracted_emails 
  WHERE email LIKE '%@%'
  GROUP BY SPLIT_PART(email, '@', 2)
  ORDER BY email_count DESC, unique_sources DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to classify email engagement level
CREATE OR REPLACE FUNCTION classify_email_engagement(input_email TEXT)
RETURNS TABLE(
  email TEXT,
  engagement_score DECIMAL,
  interaction_count BIGINT,
  last_interaction TIMESTAMP WITH TIME ZONE,
  classifications TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    input_email as email,
    AVG(confidence) as engagement_score,
    COUNT(*) as interaction_count,
    MAX(extracted_at) as last_interaction,
    ARRAY_AGG(DISTINCT classification) as classifications
  FROM extracted_emails 
  WHERE extracted_emails.email = input_email
  GROUP BY input_email;
END;
$$ LANGUAGE plpgsql;