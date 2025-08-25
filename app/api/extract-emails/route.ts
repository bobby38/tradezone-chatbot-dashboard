import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

// Email regex pattern
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g

interface ExtractedEmail {
  email: string
  source_type: 'chat_log' | 'form_submission'
  source_id: string
  context: string
  classification: string
  confidence: number
  extracted_at: string
}

export async function POST(req: NextRequest) {
  try {
    const { extractNew = true, limit = 100 } = await req.json()

    const extractedEmails: ExtractedEmail[] = []

    if (extractNew) {
      // Extract emails from chat logs
      const { data: chatLogs, error: chatError } = await supabaseAdmin
        .from('chat_logs')
        .select('id, prompt, response, created_at, user_id')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (chatError) {
        console.error('Error fetching chat logs:', chatError)
      } else if (chatLogs) {
        for (const chat of chatLogs) {
          // Extract emails from prompt
          const promptEmails = extractEmailsFromText(chat.prompt || '')
          promptEmails.forEach(email => {
            const classification = classifyEmailContext(chat.prompt || '', email)
            extractedEmails.push({
              email,
              source_type: 'chat_log',
              source_id: chat.id,
              context: `User prompt: "${chat.prompt?.substring(0, 200)}..."`,
              classification: classification.type,
              confidence: classification.confidence,
              extracted_at: new Date().toISOString()
            })
          })

          // Extract emails from response
          const responseEmails = extractEmailsFromText(chat.response || '')
          responseEmails.forEach(email => {
            const classification = classifyEmailContext(chat.response || '', email)
            extractedEmails.push({
              email,
              source_type: 'chat_log',
              source_id: chat.id,
              context: `Bot response: "${chat.response?.substring(0, 200)}..."`,
              classification: classification.type,
              confidence: classification.confidence,
              extracted_at: new Date().toISOString()
            })
          })
        }
      }

      // Extract emails from form submissions (for completeness)
      const { data: submissions, error: submissionError } = await supabaseAdmin
        .from('submissions')
        .select('id, ai_metadata, content_input, created_at')
        .eq('content_type', 'Form Submission')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (submissionError) {
        console.error('Error fetching submissions:', submissionError)
      } else if (submissions) {
        for (const submission of submissions) {
          const metadata = submission.ai_metadata || {}
          
          // Direct email from metadata
          if (metadata.email) {
            const classification = classifySubmissionContext(metadata)
            extractedEmails.push({
              email: metadata.email,
              source_type: 'form_submission',
              source_id: submission.id,
              context: `Form submission - Name: ${metadata.name || 'Unknown'}, Subject: ${metadata.subject || 'None'}`,
              classification: classification.type,
              confidence: classification.confidence,
              extracted_at: new Date().toISOString()
            })
          }

          // Extract from raw content
          const contentEmails = extractEmailsFromText(submission.content_input || '')
          contentEmails.forEach(email => {
            if (email !== metadata.email) { // Avoid duplicates
              const classification = classifyEmailContext(submission.content_input || '', email)
              extractedEmails.push({
                email,
                source_type: 'form_submission',
                source_id: submission.id,
                context: `Raw form data: "${submission.content_input?.substring(0, 200)}..."`,
                classification: classification.type,
                confidence: classification.confidence,
                extracted_at: new Date().toISOString()
              })
            }
          })
        }
      }
    }

    // Store extracted emails in database (create table if needed)
    if (extractedEmails.length > 0) {
      try {
        const { error: insertError } = await supabaseAdmin
          .from('extracted_emails')
          .upsert(extractedEmails, { 
            onConflict: 'email,source_type,source_id',
            ignoreDuplicates: true 
          })

        if (insertError) {
          console.error('Error storing extracted emails:', insertError)
        }
      } catch (dbError) {
        console.warn('extracted_emails table may not exist yet:', dbError)
      }
    }

    // Get all stored emails with stats
    const { data: allEmails, error: getAllError } = await supabaseAdmin
      .from('extracted_emails')
      .select('*')
      .order('extracted_at', { ascending: false })

    if (getAllError && getAllError.code !== 'PGRST116') { // Ignore table not found
      console.error('Error fetching all emails:', getAllError)
    }

    // Generate statistics
    const stats = generateEmailStats(allEmails || extractedEmails)

    return NextResponse.json({
      success: true,
      newEmails: extractedEmails.length,
      totalEmails: allEmails?.length || extractedEmails.length,
      extractedEmails: extractedEmails,
      allEmails: allEmails || extractedEmails,
      stats
    })

  } catch (error) {
    console.error('Email extraction error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    // Get all stored extracted emails
    const { data: emails, error } = await supabaseAdmin
      .from('extracted_emails')
      .select('*')
      .order('extracted_at', { ascending: false })

    if (error) {
      if (error.code === 'PGRST116' || error.code === '42P01') {
        // Table doesn't exist yet
        return NextResponse.json({
          success: true,
          emails: [],
          stats: { total: 0, bySource: {}, byClassification: {}, topDomains: [] }
        })
      }
      throw error
    }

    const stats = generateEmailStats(emails || [])

    return NextResponse.json({
      success: true,
      emails: emails || [],
      stats
    })

  } catch (error) {
    console.error('Get emails error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function extractEmailsFromText(text: string): string[] {
  if (!text) return []
  const matches = text.match(EMAIL_REGEX) || []
  return [...new Set(matches.map(email => email.toLowerCase()))] // Remove duplicates and normalize
}

function classifyEmailContext(context: string, email: string): { type: string; confidence: number } {
  const lowerContext = context.toLowerCase()
  
  // High confidence classifications
  if (lowerContext.includes('trade') || lowerContext.includes('sell') || lowerContext.includes('buy')) {
    return { type: 'trade_inquiry', confidence: 0.9 }
  }
  
  if (lowerContext.includes('support') || lowerContext.includes('help') || lowerContext.includes('problem')) {
    return { type: 'support_request', confidence: 0.9 }
  }
  
  if (lowerContext.includes('contact') || lowerContext.includes('reach') || lowerContext.includes('get in touch')) {
    return { type: 'contact_inquiry', confidence: 0.8 }
  }
  
  if (lowerContext.includes('price') || lowerContext.includes('quote') || lowerContext.includes('cost')) {
    return { type: 'pricing_inquiry', confidence: 0.8 }
  }
  
  // Medium confidence
  if (lowerContext.includes('phone') || lowerContext.includes('device') || lowerContext.includes('iphone') || lowerContext.includes('samsung')) {
    return { type: 'product_inquiry', confidence: 0.7 }
  }
  
  // Default classification
  return { type: 'general_inquiry', confidence: 0.5 }
}

function classifySubmissionContext(metadata: any): { type: string; confidence: number } {
  if (metadata.device_type || metadata.console_type || metadata.body_condition) {
    return { type: 'trade_in_form', confidence: 1.0 }
  }
  
  if (metadata.subject?.toLowerCase().includes('trade') || metadata.message?.toLowerCase().includes('trade')) {
    return { type: 'trade_inquiry', confidence: 0.9 }
  }
  
  return { type: 'contact_form', confidence: 0.8 }
}

function generateEmailStats(emails: ExtractedEmail[]) {
  const stats = {
    total: emails.length,
    bySource: {} as Record<string, number>,
    byClassification: {} as Record<string, number>,
    topDomains: [] as Array<{ domain: string; count: number }>
  }

  const domainCounts = {} as Record<string, number>

  emails.forEach(email => {
    // Count by source
    stats.bySource[email.source_type] = (stats.bySource[email.source_type] || 0) + 1
    
    // Count by classification
    stats.byClassification[email.classification] = (stats.byClassification[email.classification] || 0) + 1
    
    // Count domains
    const domain = email.email.split('@')[1]
    if (domain) {
      domainCounts[domain] = (domainCounts[domain] || 0) + 1
    }
  })

  // Top 10 domains
  stats.topDomains = Object.entries(domainCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([domain, count]) => ({ domain, count }))

  return stats
}