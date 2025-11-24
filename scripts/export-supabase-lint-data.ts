#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchAndWrite(rpcName: string, filename: string) {
  console.log(`Fetching ${rpcName}...`);
  const { data, error } = await supabase.rpc(rpcName);
  if (error) {
    console.error(`Error calling ${rpcName}:`, error);
    return false;
  }
  const outputPath = path.join('docs', filename);
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log(`Saved ${rpcName} output → ${outputPath}`);
  return true;
}

async function main() {
  const tasks: Array<[string, string]> = [
    ['get_rls_policies', 'supabase-rls-policies-latest.json'],
    ['get_permissive_policy_collisions', 'supabase-rls-collisions-latest.json'],
    ['get_duplicate_indexes', 'supabase-duplicate-indexes-latest.json'],
  ];

  let success = true;
  for (const [rpcName, filename] of tasks) {
    const result = await fetchAndWrite(rpcName, filename);
    success &&= result;
  }

  if (!success) {
    console.error('One or more Supabase RPC calls failed. See logs above.');
    process.exit(1);
  }

  console.log('Supabase lint snapshots complete.');
}

main().catch((err) => {
  console.error('Unhandled error while exporting Supabase data:', err);
  process.exit(1);
});
