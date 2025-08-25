-- Create structured table for Fluent Forms contact submissions
-- Based on real data structure from bobby_dennie@hotmail.com submission

CREATE TABLE IF NOT EXISTS fluent_forms_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID REFERENCES submissions(id),
  
  -- Form Identity 
  fluent_form_id TEXT, -- from __submission.form_id
  fluent_submission_id TEXT, -- from __submission.id  
  serial_number TEXT, -- from __submission.serial_number
  nonce TEXT, -- from _fluentform_1_fluentformnonce
  
  -- Contact Information
  first_name TEXT, -- from names.first_name
  last_name TEXT, -- from names.last_name  
  full_name TEXT, -- from user_inputs.names
  email TEXT, -- from email
  
  -- Message Details
  subject TEXT, -- from subject
  message TEXT, -- from message
  
  -- Source & Tracking
  source_url TEXT, -- from __submission.source_url
  ip_address INET, -- from __submission.ip
  browser TEXT, -- from __submission.browser  
  device TEXT, -- from __submission.device
  city TEXT, -- from __submission.city
  country TEXT, -- from __submission.country
  
  -- Fluent Forms Status
  ff_status TEXT, -- from __submission.status (unread/read)
  is_favourite BOOLEAN DEFAULT FALSE, -- from __submission.is_favourite
  ff_user_id TEXT, -- from __submission.user_id
  
  -- Lead Management
  lead_status TEXT DEFAULT 'new', -- our internal status: new, contacted, qualified, converted, closed
  priority TEXT DEFAULT 'normal', -- low, normal, high, urgent
  lead_score INTEGER DEFAULT 0,
  assigned_to TEXT,
  
  -- Follow-up
  follow_up_date TIMESTAMP WITH TIME ZONE,
  last_contacted TIMESTAMP WITH TIME ZONE,
  response_sent BOOLEAN DEFAULT FALSE,
  notes TEXT,
  
  -- Fluent Forms Timestamps
  ff_created_at TIMESTAMP WITH TIME ZONE, -- from __submission.created_at
  ff_updated_at TIMESTAMP WITH TIME ZONE, -- from __submission.updated_at
  
  -- Our timestamps
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_ff_contacts_email ON fluent_forms_contacts(email);
CREATE INDEX IF NOT EXISTS idx_ff_contacts_lead_status ON fluent_forms_contacts(lead_status);
CREATE INDEX IF NOT EXISTS idx_ff_contacts_ff_form_id ON fluent_forms_contacts(fluent_form_id);
CREATE INDEX IF NOT EXISTS idx_ff_contacts_ip ON fluent_forms_contacts(ip_address);
CREATE INDEX IF NOT EXISTS idx_ff_contacts_processed_at ON fluent_forms_contacts(processed_at);
CREATE INDEX IF NOT EXISTS idx_ff_contacts_lead_score ON fluent_forms_contacts(lead_score DESC);

-- Enable RLS
ALTER TABLE fluent_forms_contacts ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
CREATE POLICY "Allow authenticated users to manage fluent forms contacts" ON fluent_forms_contacts
  FOR ALL USING (true);

-- Create analytics view
CREATE OR REPLACE VIEW fluent_forms_daily_summary AS
SELECT 
  DATE(processed_at) as submission_date,
  fluent_form_id,
  COUNT(*) as total_submissions,
  COUNT(CASE WHEN lead_status = 'new' THEN 1 END) as new_leads,
  COUNT(CASE WHEN lead_status = 'contacted' THEN 1 END) as contacted,
  COUNT(CASE WHEN lead_status = 'qualified' THEN 1 END) as qualified,
  COUNT(CASE WHEN lead_status = 'converted' THEN 1 END) as converted,
  COUNT(CASE WHEN response_sent = true THEN 1 END) as responses_sent,
  AVG(lead_score) as avg_lead_score,
  COUNT(DISTINCT ip_address) as unique_ips,
  COUNT(CASE WHEN browser = 'Chrome' THEN 1 END) as chrome_users,
  COUNT(CASE WHEN device = 'Apple' THEN 1 END) as apple_users
FROM fluent_forms_contacts 
GROUP BY DATE(processed_at), fluent_form_id
ORDER BY submission_date DESC;

-- Create a function to parse and insert Fluent Forms data
CREATE OR REPLACE FUNCTION parse_fluent_form_submission(submission_data JSONB)
RETURNS UUID AS $$
DECLARE
  new_id UUID;
  submission_meta JSONB;
BEGIN
  -- Extract __submission metadata
  submission_meta := submission_data->'__submission';
  
  INSERT INTO fluent_forms_contacts (
    fluent_form_id,
    fluent_submission_id, 
    serial_number,
    nonce,
    first_name,
    last_name,
    full_name,
    email,
    subject,
    message,
    source_url,
    ip_address,
    browser,
    device,
    city,
    country,
    ff_status,
    is_favourite,
    ff_user_id,
    ff_created_at,
    ff_updated_at
  ) VALUES (
    submission_meta->>'form_id',
    submission_meta->>'id',
    submission_meta->>'serial_number', 
    submission_data->>'_fluentform_1_fluentformnonce',
    submission_data->'names'->>'first_name',
    submission_data->'names'->>'last_name',
    submission_meta->'user_inputs'->>'names',
    submission_data->>'email',
    submission_data->>'subject',
    submission_data->>'message',
    submission_meta->>'source_url',
    (submission_meta->>'ip')::INET,
    submission_meta->>'browser',
    submission_meta->>'device', 
    submission_meta->>'city',
    submission_meta->>'country',
    submission_meta->>'status',
    CASE WHEN submission_meta->>'is_favourite' = '1' THEN true ELSE false END,
    submission_meta->>'user_id',
    (submission_meta->>'created_at')::TIMESTAMP,
    (submission_meta->>'updated_at')::TIMESTAMP
  ) RETURNING id INTO new_id;
  
  RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- Test the parser with the real data
SELECT parse_fluent_form_submission('{
  "_fluentform_1_fluentformnonce": "8632dd5216",
  "names": {
    "first_name": "Bobby",
    "last_name": "Dennie"
  },
  "email": "bobby_dennie@hotmail.com",
  "subject": "test 1-2",
  "message": "in contact form https://tradezone.sg/contact-us/",
  "__submission": {
    "id": "527",
    "form_id": "1",
    "serial_number": "178",
    "source_url": "https://tradezone.sg/contact-us/",
    "user_id": "1",
    "status": "unread",
    "is_favourite": "0",
    "browser": "Chrome",
    "device": "Apple",
    "ip": "115.66.198.132",
    "city": null,
    "country": null,
    "created_at": "2025-08-24 15:04:48",
    "updated_at": "2025-08-24 15:04:48"
  }
}'::JSONB) as parsed_contact_id;