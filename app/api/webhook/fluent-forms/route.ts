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
    
    // Log webhook received for debugging
    console.log('Fluent Forms webhook received from IP:', realIP)
    
    // Extract form data from Fluent Forms webhook payload
    const formData = body.data || body
    const formType = body.form_id ? `form_${body.form_id}` : 'unknown'
    
    // Determine if this is contact form or trade-in form based on fields
    let submissionType = 'contact'
    if (formData.device_type || formData.console_type || formData.body_condition) {
      submissionType = 'trade-in'
    }
    
    // Insert into form_submissions table
    const { data, error } = await supabase
      .from('form_submissions')
      .insert({
        form_type: submissionType,
        form_id: body.form_id?.toString() || 'unknown',
        form_data: formData,
        source: 'fluent-forms',
        status: 'pending'
      })
      .select()
    
    if (error) {
      console.error('Error saving form submission:', error)
      return NextResponse.json({ error: 'Failed to save submission' }, { status: 500 })
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