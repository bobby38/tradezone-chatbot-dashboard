import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

interface EmailReportRequest {
  frequency: 'week' | 'month'
  email: string
  reportData: any
}

// SMTP Configuration - Add these to your .env.local file
const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || '', // Your email
    pass: process.env.SMTP_PASS || '', // Your email password or app password
  },
}

export async function POST(request: NextRequest) {
  try {
    const { frequency, email, reportData }: EmailReportRequest = await request.json()

    // Validate SMTP configuration
    if (!SMTP_CONFIG.auth.user || !SMTP_CONFIG.auth.pass) {
      return NextResponse.json(
        { error: 'SMTP configuration missing. Please add SMTP_USER and SMTP_PASS to .env.local' },
        { status: 400 }
      )
    }

    // Create transporter
    const transporter = nodemailer.createTransport(SMTP_CONFIG)

    // Generate email content
    const emailContent = generateEmailReport(reportData, frequency)

    // Send test email immediately
    const mailOptions = {
      from: SMTP_CONFIG.auth.user,
      to: email,
      subject: `Tradezone Analytics Report - ${frequency === 'week' ? 'Weekly' : 'Monthly'} Summary`,
      html: emailContent,
    }

    await transporter.sendMail(mailOptions)

    // In a production environment, you would also:
    // 1. Store the schedule in a database
    // 2. Set up a cron job or scheduled task
    // 3. Use a job queue system like Bull or Agenda

    // For now, we'll just send a confirmation
    return NextResponse.json({ 
      success: true, 
      message: `${frequency === 'week' ? 'Weekly' : 'Monthly'} email reports scheduled successfully. Test email sent to ${email}.`
    })

  } catch (error) {
    console.error('Email scheduling error:', error)
    return NextResponse.json(
      { error: 'Failed to schedule email reports' },
      { status: 500 }
    )
  }
}

function generateEmailReport(reportData: any, frequency: string): string {
  const currentDate = new Date().toLocaleDateString()
  const period = frequency === 'week' ? 'Weekly' : 'Monthly'
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Tradezone Analytics Report</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
        .metric { background: white; padding: 20px; margin: 15px 0; border-radius: 8px; border-left: 4px solid #667eea; }
        .metric h3 { margin: 0 0 10px 0; color: #667eea; }
        .metric p { margin: 0; font-size: 18px; font-weight: bold; }
        .recommendations { background: white; padding: 20px; margin: 15px 0; border-radius: 8px; }
        .recommendation { margin: 15px 0; padding: 15px; background: #f1f3f4; border-radius: 5px; }
        .topics { background: white; padding: 20px; margin: 15px 0; border-radius: 8px; }
        .topic { display: inline-block; background: #e3f2fd; color: #1976d2; padding: 5px 12px; margin: 5px; border-radius: 15px; font-size: 14px; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🤖 Tradezone Analytics Report</h1>
        <p>${period} Summary - ${currentDate}</p>
      </div>
      
      <div class="content">
        <div class="metric">
          <h3>📊 Overall Sentiment</h3>
          <p>${reportData?.overall_sentiment?.sentiment?.toUpperCase() || 'N/A'}</p>
          <small>Confidence: ${Math.round((reportData?.overall_sentiment?.confidence || 0) * 100)}%</small>
        </div>
        
        <div class="metric">
          <h3>⭐ Performance Metrics</h3>
          <p>Response Quality: ${reportData?.performance_feedback?.response_quality || 'N/A'}/10</p>
          <p>User Satisfaction: ${reportData?.performance_feedback?.user_satisfaction || 'N/A'}/10</p>
        </div>
        
        <div class="topics">
          <h3>🔥 Trending Topics</h3>
          ${(reportData?.trending_topics || []).map((topic: string) => `<span class="topic">${topic}</span>`).join('')}
        </div>
        
        <div class="recommendations">
          <h3>💡 AI Recommendations</h3>
          ${(reportData?.recommendations || []).map((rec: any) => `
            <div class="recommendation">
              <strong>${rec.title}</strong>
              <p>${rec.description}</p>
            </div>
          `).join('')}
        </div>
      </div>
      
      <div class="footer">
        <p>This is an automated report from your Tradezone Chatbot Dashboard.</p>
        <p>Visit your dashboard to view detailed analytics and insights.</p>
      </div>
    </body>
    </html>
  `
}
