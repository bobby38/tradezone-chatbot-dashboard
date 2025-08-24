require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

console.log('Creating required tables...')
console.log('Supabase URL:', supabaseUrl)

const supabase = createClient(supabaseUrl, supabaseKey)

async function createTables() {
  try {
    console.log('Creating form_submissions table...')
    
    const formSubmissionsSQL = `
      CREATE TABLE IF NOT EXISTS form_submissions (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        form_type TEXT NOT NULL,
        form_id TEXT NOT NULL,
        form_data JSONB NOT NULL,
        source TEXT DEFAULT 'fluent-forms',
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_form_submissions_created_at ON form_submissions(created_at);
      CREATE INDEX IF NOT EXISTS idx_form_submissions_form_type ON form_submissions(form_type);
      CREATE INDEX IF NOT EXISTS idx_form_submissions_status ON form_submissions(status);

      ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS "Allow authenticated users to view form submissions" ON form_submissions;
      DROP POLICY IF EXISTS "Allow webhook to insert form submissions" ON form_submissions;

      CREATE POLICY "Allow authenticated users to view form submissions" ON form_submissions
        FOR SELECT USING (auth.role() = 'authenticated');

      CREATE POLICY "Allow webhook to insert form submissions" ON form_submissions
        FOR INSERT WITH CHECK (true);
    `
    
    const { error: formError } = await supabase.rpc('exec_sql', { sql: formSubmissionsSQL })
    
    if (formError) {
      console.error('Error creating form_submissions table:', formError)
    } else {
      console.log('✅ form_submissions table created successfully')
    }

    console.log('Creating settings table...')
    
    const settingsSQL = `
      CREATE TABLE IF NOT EXISTS settings (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT 'default',
        setting_type TEXT NOT NULL,
        setting_key TEXT NOT NULL,
        setting_value TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_unique ON settings(user_id, setting_type, setting_key);
      CREATE INDEX IF NOT EXISTS idx_settings_user_type ON settings(user_id, setting_type);

      ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS "Allow authenticated users to manage settings" ON settings;
      
      CREATE POLICY "Allow authenticated users to manage settings" ON settings
        FOR ALL USING (auth.role() = 'authenticated');
    `
    
    const { error: settingsError } = await supabase.rpc('exec_sql', { sql: settingsSQL })
    
    if (settingsError) {
      console.error('Error creating settings table:', settingsError)
    } else {
      console.log('✅ settings table created successfully')
    }
    
    console.log('All tables created!')
    
  } catch (error) {
    console.error('Error:', error)
  }
}

createTables()