-- Add 'cancelled' and 'submitted' to trade_in_status enum
-- These statuses are used when users exit trade-in flow or complete submission

ALTER TYPE public.trade_in_status ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE public.trade_in_status ADD VALUE IF NOT EXISTS 'submitted';

-- Update comment
COMMENT ON TYPE public.trade_in_status IS 'Trade-in lead status: new, in_review, quoted, awaiting_customer, scheduled, completed, closed, archived, cancelled, submitted';
