import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Use service role key to bypass RLS for webhook inserts
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Only create client if both values are available (for build-time compatibility)
const supabaseAdmin = supabaseUrl && supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null

export async function POST(req: NextRequest) {
  try {
    // Check if Supabase client is available
    if (!supabaseAdmin) {
      console.error('Supabase client not available - missing environment variables')
      return NextResponse.json({ 
        error: 'Server configuration error',
        message: 'Database connection not available'
      }, { status: 500 })
    }

    // Get real IP through Cloudflare headers
    const realIP = req.headers.get('cf-connecting-ip') || 
                   req.headers.get('x-forwarded-for') || 
                   req.headers.get('x-real-ip') || 
                   'unknown'
    
    const body = await req.json()
    
    // Enhanced logging for debugging
    console.log('=== FLUENT FORMS WEBHOOK DEBUG ===')
    console.log('Timestamp:', new Date().toISOString())
    console.log('IP:', realIP)
    console.log('Headers:', Object.fromEntries(req.headers.entries()))
    console.log('Full Body:', JSON.stringify(body, null, 2))
    console.log('Body keys:', Object.keys(body))
    console.log('=====================================')
    
    // Extract form data from Fluent Forms webhook payload
    const formData = body.data || body
    
    // Determine if this is contact form or trade-in form based on fields
    let submissionType = 'contact'
    if (formData.device_type || formData.console_type || formData.body_condition) {
      submissionType = 'trade-in'
    }
    
    console.log('Processed data:')
    console.log('- Form Type:', submissionType)
    console.log('- Form ID:', body.form_id)
    console.log('- Form Data Keys:', Object.keys(formData))
    
    // Store the entire webhook payload in existing submissions table
    const insertData = {
      user_id: '7696939b-4bb3-4c76-bf63-0c47db8119e9', // real user ID from profiles
      org_id: '765e1172-b666-471f-9b42-f80c9b5006de',  // real org ID from organizations  
      title: `${submissionType} form submission`,
      content_input: JSON.stringify(body, null, 2),
      content_type: 'Form Submission',
      ai_metadata: formData,
      status: 'ready'
    }
    
    console.log('Inserting to submissions table:', JSON.stringify(insertData, null, 2))
    
    console.log('Attempting to insert directly with service role key...')
    
    const { data, error } = await supabaseAdmin
      .from('submissions')
      .insert(insertData)
      .select()
    
    if (error) {
      console.error('Database insert error:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      console.error('Error message:', error.message)
      console.error('Error code:', error.code)
      return NextResponse.json({ 
        error: 'Failed to save submission', 
        details: error.message || 'Unknown database error',
        code: error.code,
        hint: error.hint
      }, { status: 500 })
    }
    
    console.log(`New ${submissionType} form submission received:`, data)
    
    // Form submission saved successfully to submissions table
    // Note: Advanced parsing to fluent_forms_contacts table can be added later
    if (data?.[0]?.id && formData) {
      console.log('Form data saved successfully to submissions table')
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Form submission received and parsed',
      id: data?.[0]?.id 
    })
    
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}