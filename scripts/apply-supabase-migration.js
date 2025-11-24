#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load .env.sc first (if present) and fall back to .env.local for missing values
const dotenv = require('dotenv');
dotenv.config({ path: '.env.sc' });
dotenv.config({ path: '.env.local', override: false });

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration(filePath) {
  try {
    console.log(`Applying migration from ${filePath}...`);
    const sql = fs.readFileSync(filePath, 'utf8');
    
    // Execute SQL using Supabase's REST API
    const { error } = await supabase.rpc('exec_sql', { sql });
    
    if (error) {
      console.error('Error applying migration:', error);
      return false;
    }
    
    console.log(`Successfully applied migration: ${path.basename(filePath)}`);
    return true;
  } catch (err) {
    console.error(`Error reading or applying migration ${filePath}:`, err);
    return false;
  }
}

async function main() {
  // Get migration file paths from command line arguments or use default
  const migrationFiles = process.argv.slice(2);
  
  if (migrationFiles.length === 0) {
    console.error('Please provide migration file paths as arguments');
    process.exit(1);
  }
  
  let success = true;
  
  for (const filePath of migrationFiles) {
    const result = await applyMigration(filePath);
    if (!result) {
      success = false;
    }
  }
  
  if (!success) {
    console.error('Some migrations failed to apply');
    process.exit(1);
  }
  
  console.log('All migrations applied successfully');
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
