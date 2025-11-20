-- Add 'installment' to trade_in_payout enum
-- This allows customers to choose installment payment plans

ALTER TYPE public.trade_in_payout ADD VALUE IF NOT EXISTS 'installment';
