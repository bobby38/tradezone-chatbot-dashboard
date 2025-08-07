-- WooCommerce Snapshots Table
-- Run this in your Supabase SQL Editor to create the WooCommerce data storage

-- Create wc_snapshots table for WooCommerce data
CREATE TABLE IF NOT EXISTS wc_snapshots (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ DEFAULT NOW(),
  orders_today INTEGER DEFAULT 0,
  orders_completed INTEGER DEFAULT 0,
  orders_processing INTEGER DEFAULT 0,
  orders_pending INTEGER DEFAULT 0,
  total_sales DECIMAL(10,2) DEFAULT 0,
  top_products JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_wc_snapshots_ts ON wc_snapshots(ts);
CREATE INDEX IF NOT EXISTS idx_wc_snapshots_created_at ON wc_snapshots(created_at);

-- Create ga_daily table for Google Analytics data
CREATE TABLE IF NOT EXISTS ga_daily (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  sessions INTEGER DEFAULT 0,
  users INTEGER DEFAULT 0,
  new_users INTEGER DEFAULT 0,
  page_views INTEGER DEFAULT 0,
  bounce_rate DECIMAL(5,2) DEFAULT 0,
  avg_session_duration DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date)
);

-- Create sc_daily table for Search Console data
CREATE TABLE IF NOT EXISTS sc_daily (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  clicks INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  ctr DECIMAL(5,2) DEFAULT 0,
  position DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date)
);

-- Create indexes for analytics tables
CREATE INDEX IF NOT EXISTS idx_ga_daily_date ON ga_daily(date);
CREATE INDEX IF NOT EXISTS idx_sc_daily_date ON sc_daily(date);
