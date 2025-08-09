#!/usr/bin/env node

const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.sc' });

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.sc');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createGscTables() {
  try {
    console.log('Creating GSC tables...');
    
    // Create gsc_daily_summary table
    const { error: summaryError } = await supabase.from('gsc_daily_summary').select('count(*)', { count: 'exact', head: true })
      .then(async ({ error }) => {
        if (error && error.code === 'PGRST301') {
          console.log('Creating gsc_daily_summary table...');
          // Table doesn't exist, create it
          return await supabase.rpc('postgres', {
            sql: `
              CREATE TABLE IF NOT EXISTS gsc_daily_summary (
                date DATE PRIMARY KEY,
                site TEXT NOT NULL,
                clicks INTEGER NOT NULL,
                impressions INTEGER NOT NULL,
                ctr NUMERIC(5,2) NOT NULL,
                position NUMERIC(5,2) NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
              );
              
              CREATE INDEX IF NOT EXISTS gsc_daily_summary_site_idx ON gsc_daily_summary(site);
              CREATE INDEX IF NOT EXISTS gsc_daily_summary_date_idx ON gsc_daily_summary(date);
            `
          }).catch(e => ({ error: e }));
        }
        return { error: null };
      });
    
    if (summaryError) {
      console.error('Error creating gsc_daily_summary table:', summaryError);
      return false;
    }
    
    // Create gsc_performance table
    const { error: perfError } = await supabase.from('gsc_performance').select('count(*)', { count: 'exact', head: true })
      .then(async ({ error }) => {
        if (error && error.code === 'PGRST301') {
          console.log('Creating gsc_performance table...');
          // Table doesn't exist, create it
          return await supabase.rpc('postgres', {
            sql: `
              CREATE TABLE IF NOT EXISTS gsc_performance (
                date DATE NOT NULL,
                site TEXT NOT NULL,
                query TEXT NOT NULL,
                page TEXT NOT NULL,
                country TEXT NOT NULL,
                device TEXT NOT NULL,
                clicks INTEGER NOT NULL,
                impressions INTEGER NOT NULL,
                ctr NUMERIC(5,2) NOT NULL,
                position NUMERIC(5,2) NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                PRIMARY KEY (date, site, query, page, country, device)
              );
              
              CREATE INDEX IF NOT EXISTS gsc_performance_site_idx ON gsc_performance(site);
              CREATE INDEX IF NOT EXISTS gsc_performance_date_idx ON gsc_performance(date);
              CREATE INDEX IF NOT EXISTS gsc_performance_query_idx ON gsc_performance(query);
              CREATE INDEX IF NOT EXISTS gsc_performance_page_idx ON gsc_performance(page);
            `
          }).catch(e => ({ error: e }));
        }
        return { error: null };
      });
    
    if (perfError) {
      console.error('Error creating gsc_performance table:', perfError);
      return false;
    }
    
    console.log('GSC tables created or already exist.');
    return true;
  } catch (err) {
    console.error('Error creating GSC tables:', err);
    return false;
  }
}

createGscTables().then(success => {
  if (!success) {
    console.error('Failed to create GSC tables');
    process.exit(1);
  }
  console.log('Done');
}).catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
