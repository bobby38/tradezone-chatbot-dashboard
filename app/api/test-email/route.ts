import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

interface TestEmailRequest {
  smtpConfig: {
    host: string
    port: string
    user: string
    pass: string
    fromEmail?: string
    fromName?: string
  }
  testEmail: string
}

export async function POST(request: NextRequest) {
  try {
    const { smtpConfig, testEmail }: TestEmailRequest = await request.json()

    // Validate required fields
    if (!smtpConfig.host || !smtpConfig.user || !smtpConfig.pass) {
      return NextResponse.json(
        { error: 'Missing required SMTP configuration fields' },
        { status: 400 }
      )
    }

    // Create transporter with provided SMTP settings
    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: parseInt(smtpConfig.port) || 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.pass,
      },
    })

    // Verify connection
    await transporter.verify()

    // Generate test email content
    const testEmailContent = generateTestEmailTemplate()

    // Send test email
    const fromAddress = smtpConfig.fromEmail || smtpConfig.user
    const fromName = smtpConfig.fromName || 'Tradezone Dashboard'
    
    const mailOptions = {
      from: smtpConfig.fromName ? `"${fromName}" <${fromAddress}>` : fromAddress,
      to: testEmail,
      subject: '🧪 Tradezone Dashboard - SMTP Test Email',
      html: testEmailContent,
    }

    const info = await transporter.sendMail(mailOptions)

    return NextResponse.json({ 
      success: true, 
      message: `Test email sent successfully to ${testEmail}`,
      messageId: info.messageId
    })

  } catch (error: any) {
    console.error('Test email error:', error)
    
    // Provide specific error messages for common issues
    let errorMessage = 'Failed to send test email'
    
    if (error.code === 'EAUTH') {
      errorMessage = 'Authentication failed. Check your email and app password.'
    } else if (error.code === 'ECONNECTION') {
      errorMessage = 'Connection failed. Check your SMTP host and port.'
    } else if (error.code === 'ESOCKET') {
      errorMessage = 'Network error. Check your internet connection.'
    } else if (error.message) {
      errorMessage = error.message
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

function generateTestEmailTemplate(): string {
  const currentDate = new Date().toLocaleDateString()
  const currentTime = new Date().toLocaleTimeString()
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>SMTP Test Email</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          line-height: 1.6; 
          color: #333; 
          max-width: 600px; 
          margin: 0 auto; 
          padding: 20px; 
          background-color: #f5f5f5;
        }
        .container {
          background: white;
          border-radius: 10px;
          overflow: hidden;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .header { 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
          color: white; 
          padding: 30px; 
          text-align: center; 
        }
        .content { 
          padding: 30px; 
        }
        .success-badge {
          background: #10b981;
          color: white;
          padding: 10px 20px;
          border-radius: 25px;
          display: inline-block;
          font-weight: bold;
          margin: 20px 0;
        }
        .info-box {
          background: #f0f9ff;
          border: 1px solid #0ea5e9;
          border-radius: 8px;
          padding: 20px;
          margin: 20px 0;
        }
        .footer { 
          text-align: center; 
          margin-top: 30px; 
          color: #666; 
          font-size: 14px; 
          padding: 20px;
          background: #f8f9fa;
        }
        .emoji { font-size: 24px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="emoji">🧪</div>
          <h1>SMTP Test Successful!</h1>
          <p>Your email configuration is working perfectly</p>
        </div>
        
        <div class="content">
          <div class="success-badge">
            ✅ Test Passed
          </div>
          
          <h2>🎉 Congratulations!</h2>
          <p>Your SMTP configuration has been successfully tested and is ready to send automated analytics reports.</p>
          
          <div class="info-box">
            <h3>📊 What's Next?</h3>
            <ul>
              <li><strong>Weekly Reports:</strong> Get analytics summaries every week</li>
              <li><strong>Monthly Reports:</strong> Comprehensive monthly insights</li>
              <li><strong>Real-time Analytics:</strong> AI-powered chat analysis</li>
              <li><strong>Export Features:</strong> Download reports in JSON/CSV formats</li>
            </ul>
          </div>
          
          <div class="info-box">
            <h3>📧 Email Features Ready:</h3>
            <ul>
              <li>✅ SMTP Connection Verified</li>
              <li>✅ Authentication Successful</li>
              <li>✅ Email Delivery Working</li>
              <li>✅ HTML Templates Supported</li>
            </ul>
          </div>
          
          <p><strong>Test Details:</strong></p>
          <ul>
            <li>Date: ${currentDate}</li>
            <li>Time: ${currentTime}</li>
            <li>Status: Successfully Delivered</li>
          </ul>
        </div>
        
        <div class="footer">
          <p>This test email was sent from your Tradezone Chatbot Dashboard.</p>
          <p>You can now schedule weekly or monthly analytics reports!</p>
        </div>
      </div>
    </body>
    </html>
  `
}
