require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

console.log('Creating webhook RLS policy...')
console.log('Supabase URL:', supabaseUrl)

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function createWebhookPolicy() {
  try {
    console.log('Creating RLS policy to allow webhook inserts...')
    
    // Create a simple policy that allows inserts for content_type 'Form Submission'
    const webhookPolicySQL = `
      CREATE POLICY "Allow webhook form submissions" ON submissions
        FOR INSERT WITH CHECK (content_type = 'Form Submission');
    `
    
    const { data, error } = await supabase.rpc('exec_sql', { sql: webhookPolicySQL })
    
    if (error) {
      console.error('Error creating webhook policy:', error)
      console.log('Policy might already exist, which is fine.')
    } else {
      console.log('✅ Webhook policy created successfully')
    }
    
  } catch (error) {
    console.error('Error:', error)
  }
}

createWebhookPolicy()