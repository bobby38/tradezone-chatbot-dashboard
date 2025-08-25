-- Create structured tables for form data analysis
-- This allows proper querying, analytics, and follow-up tracking

-- Contact Forms Table (for contact/inquiry forms)
CREATE TABLE IF NOT EXISTS contact_forms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID REFERENCES submissions(id),
  
  -- Contact Information
  name TEXT,
  email TEXT,
  phone TEXT,
  company TEXT,
  
  -- Message Details
  subject TEXT,
  message TEXT,
  inquiry_type TEXT, -- e.g., 'general', 'support', 'sales', 'partnership'
  
  -- Source & Tracking
  form_id TEXT,
  source_page TEXT,
  referrer TEXT,
  utm_campaign TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  
  -- Lead Scoring & Status
  lead_score INTEGER DEFAULT 0,
  status TEXT DEFAULT 'new', -- 'new', 'contacted', 'qualified', 'converted', 'closed'
  priority TEXT DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
  
  -- Follow-up Tracking
  assigned_to TEXT,
  follow_up_date TIMESTAMP WITH TIME ZONE,
  last_contacted TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trade-in Forms Table (for device trade-in forms)
CREATE TABLE IF NOT EXISTS trade_in_forms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID REFERENCES submissions(id),
  
  -- Customer Information
  name TEXT,
  email TEXT,
  phone TEXT,
  
  -- Device Information
  device_type TEXT, -- 'phone', 'tablet', 'laptop', 'console', etc.
  brand TEXT,
  model TEXT,
  storage_capacity TEXT,
  color TEXT,
  
  -- Condition Assessment
  body_condition TEXT, -- 'excellent', 'good', 'fair', 'poor'
  screen_condition TEXT,
  battery_condition TEXT,
  functional_issues TEXT[],
  accessories_included TEXT[],
  
  -- Trade-in Details
  estimated_value DECIMAL(10,2),
  final_offer DECIMAL(10,2),
  trade_in_method TEXT, -- 'mail', 'store_visit', 'pickup'
  
  -- Status & Processing
  status TEXT DEFAULT 'pending', -- 'pending', 'quoted', 'accepted', 'shipped', 'received', 'paid', 'cancelled'
  quote_valid_until TIMESTAMP WITH TIME ZONE,
  shipping_label_sent BOOLEAN DEFAULT FALSE,
  device_received_date TIMESTAMP WITH TIME ZONE,
  payment_sent_date TIMESTAMP WITH TIME ZONE,
  
  -- Source & Tracking
  form_id TEXT,
  source_page TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Form Analytics Table (for tracking form performance)
CREATE TABLE IF NOT EXISTS form_analytics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Form Identification
  form_id TEXT NOT NULL,
  form_type TEXT NOT NULL, -- 'contact', 'trade_in', etc.
  source_page TEXT,
  
  -- Metrics
  submission_date DATE NOT NULL,
  submissions_count INTEGER DEFAULT 1,
  conversion_rate DECIMAL(5,2), -- percentage
  bounce_rate DECIMAL(5,2), -- percentage
  
  -- Response Tracking
  responded_count INTEGER DEFAULT 0,
  converted_count INTEGER DEFAULT 0,
  avg_response_time_hours DECIMAL(8,2),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure unique daily records per form
  UNIQUE(form_id, form_type, submission_date)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_contact_forms_email ON contact_forms(email);
CREATE INDEX IF NOT EXISTS idx_contact_forms_status ON contact_forms(status);
CREATE INDEX IF NOT EXISTS idx_contact_forms_created_at ON contact_forms(created_at);
CREATE INDEX IF NOT EXISTS idx_contact_forms_lead_score ON contact_forms(lead_score);

CREATE INDEX IF NOT EXISTS idx_trade_in_forms_email ON trade_in_forms(email);
CREATE INDEX IF NOT EXISTS idx_trade_in_forms_status ON trade_in_forms(status);
CREATE INDEX IF NOT EXISTS idx_trade_in_forms_device_type ON trade_in_forms(device_type);
CREATE INDEX IF NOT EXISTS idx_trade_in_forms_created_at ON trade_in_forms(created_at);

CREATE INDEX IF NOT EXISTS idx_form_analytics_form_id ON form_analytics(form_id);
CREATE INDEX IF NOT EXISTS idx_form_analytics_date ON form_analytics(submission_date);
CREATE INDEX IF NOT EXISTS idx_form_analytics_type ON form_analytics(form_type);

-- Enable RLS on new tables
ALTER TABLE contact_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_in_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_analytics ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow authenticated users to manage contact forms" ON contact_forms
  FOR ALL USING (true);

CREATE POLICY "Allow authenticated users to manage trade-in forms" ON trade_in_forms  
  FOR ALL USING (true);

CREATE POLICY "Allow authenticated users to view form analytics" ON form_analytics
  FOR ALL USING (true);

-- Create views for easy analytics
CREATE OR REPLACE VIEW contact_form_summary AS
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_submissions,
  COUNT(CASE WHEN status = 'new' THEN 1 END) as new_leads,
  COUNT(CASE WHEN status = 'contacted' THEN 1 END) as contacted,
  COUNT(CASE WHEN status = 'converted' THEN 1 END) as converted,
  AVG(lead_score) as avg_lead_score,
  COUNT(CASE WHEN priority = 'high' THEN 1 END) as high_priority,
  COUNT(CASE WHEN inquiry_type = 'sales' THEN 1 END) as sales_inquiries
FROM contact_forms 
GROUP BY DATE(created_at)
ORDER BY date DESC;

CREATE OR REPLACE VIEW trade_in_summary AS
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_submissions,
  device_type,
  AVG(estimated_value) as avg_estimated_value,
  COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_quotes,
  COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted_offers,
  COUNT(CASE WHEN status = 'paid' THEN 1 END) as completed_trades
FROM trade_in_forms
GROUP BY DATE(created_at), device_type
ORDER BY date DESC, device_type;