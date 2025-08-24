import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
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
    const formType = body.form_id ? `form_${body.form_id}` : 'unknown'
    
    // Determine if this is contact form or trade-in form based on fields
    let submissionType = 'contact'
    if (formData.device_type || formData.console_type || formData.body_condition) {
      submissionType = 'trade-in'
    }
    
    console.log('Processed data:')
    console.log('- Form Type:', submissionType)
    console.log('- Form ID:', body.form_id)
    console.log('- Form Data Keys:', Object.keys(formData))
    
    // Insert into form_submissions table
    const insertData = {
      form_type: submissionType,
      form_id: body.form_id?.toString() || 'unknown',
      form_data: formData,
      source: 'fluent-forms',
      status: 'pending'
    }
    
    console.log('Inserting to database:', JSON.stringify(insertData, null, 2))
    
    const { data, error } = await supabase
      .from('form_submissions')
      .insert(insertData)
      .select()
    
    if (error) {
      console.error('Database insert error:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      return NextResponse.json({ error: 'Failed to save submission', details: error.message }, { status: 500 })
    }
    
    console.log(`New ${submissionType} form submission received:`, data)
    
    return NextResponse.json({ 
      success: true, 
      message: 'Form submission received',
      id: data?.[0]?.id 
    })
    
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}