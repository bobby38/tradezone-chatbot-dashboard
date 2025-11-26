-- Add quote caching fields to trade_in_leads table
-- Prevents re-searching for prices after initial quote is given

ALTER TABLE trade_in_leads
ADD COLUMN IF NOT EXISTS initial_quote_given BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS source_device_name TEXT,
ADD COLUMN IF NOT EXISTS source_price_quoted DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS target_device_name TEXT,
ADD COLUMN IF NOT EXISTS target_price_quoted DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS top_up_amount DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS quote_timestamp TIMESTAMPTZ;

-- Add index for quick lookup
CREATE INDEX IF NOT EXISTS idx_trade_in_leads_quote_given
ON trade_in_leads(initial_quote_given, created_at DESC);

-- Add comment
COMMENT ON COLUMN trade_in_leads.initial_quote_given IS 'Flag to prevent re-searching after initial price quote';
COMMENT ON COLUMN trade_in_leads.source_device_name IS 'Device being traded in (cached from initial quote)';
COMMENT ON COLUMN trade_in_leads.source_price_quoted IS 'Trade-in value quoted initially';
COMMENT ON COLUMN trade_in_leads.target_device_name IS 'Device customer wants to buy (for trade-ups)';
COMMENT ON COLUMN trade_in_leads.target_price_quoted IS 'Retail price quoted initially (for trade-ups)';
COMMENT ON COLUMN trade_in_leads.top_up_amount IS 'Calculated top-up amount (target - source)';
COMMENT ON COLUMN trade_in_leads.quote_timestamp IS 'When the initial quote was given';
