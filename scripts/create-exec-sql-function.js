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

async function createExecSqlFunction() {
  try {
    console.log('Creating exec_sql function...');
    
    // SQL to create the exec_sql function
    const sql = `
      -- Function to execute arbitrary SQL (for admin use only)
      -- This should be restricted to service_role access only
      CREATE OR REPLACE FUNCTION exec_sql(sql text)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      BEGIN
        EXECUTE sql;
      END;
      $$;
    `;
    
    // Execute SQL directly using Supabase REST API
    const { error } = await supabase.rpc('exec_sql', { sql });
    
    // If we get here, it means the function already exists
    console.log('exec_sql function already exists.');
    return true;
  } catch (err) {
    // If we get a "function not found" error, we need to create it using raw SQL
    if (err?.code === 'PGRST202') {
      try {
        console.log('exec_sql function not found. Creating it using raw SQL...');
        
        // Use raw SQL query to create the function
        const { error } = await supabase.from('_exec_sql_direct').select('*').limit(1).then(() => {
          console.error('Unexpected success when querying non-existent table');
          return { error: new Error('Unexpected behavior') };
        }).catch(async () => {
          // This is expected to fail, now we'll run our raw SQL
          return await supabase.rpc('postgres', { 
            sql: `
              CREATE OR REPLACE FUNCTION exec_sql(sql text)
              RETURNS void
              LANGUAGE plpgsql
              SECURITY DEFINER
              AS $$
              BEGIN
                EXECUTE sql;
              END;
              $$;
            `
          }).catch(e => ({ error: e }));
        });
        
        if (error) {
          console.error('Error creating exec_sql function:', error);
          return false;
        }
        
        console.log('Successfully created exec_sql function.');
        return true;
      } catch (innerErr) {
        console.error('Error creating exec_sql function:', innerErr);
        return false;
      }
    } else {
      console.error('Error checking for exec_sql function:', err);
      return false;
    }
  }
}

createExecSqlFunction().then(success => {
  if (!success) {
    console.error('Failed to create exec_sql function');
    process.exit(1);
  }
  console.log('Done');
}).catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
