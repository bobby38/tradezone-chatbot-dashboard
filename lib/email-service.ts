import nodemailer from 'nodemailer'
import { SettingsManager } from './settings'

export interface EmailNotificationData {
  type: 'contact' | 'trade-in'
  submissionId: string
  formData: any
  submittedAt: string
}

export class EmailService {
  static async getSmtpConfig() {
    try {
      // Try to load from settings first
      const settings = await SettingsManager.loadSettings('smtp')
      const smtpSettings = settings.smtp

      if (smtpSettings && smtpSettings.host && smtpSettings.user && smtpSettings.pass) {
        return {
          host: smtpSettings.host,
          port: parseInt(smtpSettings.port || '587'),
          secure: smtpSettings.port === '465', // true for 465, false for other ports
          auth: {
            user: smtpSettings.user,
            pass: smtpSettings.pass,
          },
          fromEmail: smtpSettings.fromEmail || smtpSettings.user,
          fromName: smtpSettings.fromName || 'TradeZone Notifications'
        }
      }
    } catch (error) {
      console.log('Could not load SMTP settings from database, falling back to env vars')
    }

    // Fallback to environment variables
    return {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      },
      fromEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || '',
      fromName: process.env.SMTP_FROM_NAME || 'TradeZone Notifications'
    }
  }

  static async sendFormNotification(data: EmailNotificationData): Promise<boolean> {
    try {
      const smtpConfig = await this.getSmtpConfig()

      if (!smtpConfig.auth.user || !smtpConfig.auth.pass) {
        console.error('SMTP configuration missing - cannot send email notification')
        return false
      }

      const transporter = nodemailer.createTransporter({
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure,
        auth: smtpConfig.auth,
      })

      // Generate email content
      const emailContent = this.generateFormNotificationTemplate(data)
      const subject = data.type === 'trade-in' 
        ? `🎮 New Trade-In Request - ${data.submissionId.slice(-8)}`
        : `📧 New Contact Form - ${data.submissionId.slice(-8)}`

      // Determine recipient email (you can make this configurable later)
      const recipientEmail = smtpConfig.fromEmail // For now, send to same email

      const mailOptions = {
        from: smtpConfig.fromName ? `"${smtpConfig.fromName}" <${smtpConfig.fromEmail}>` : smtpConfig.fromEmail,
        to: recipientEmail,
        subject: subject,
        html: emailContent,
      }

      const info = await transporter.sendMail(mailOptions)
      console.log('Form notification email sent:', info.messageId)
      
      return true
    } catch (error) {
      console.error('Failed to send form notification email:', error)
      return false
    }
  }

  static generateFormNotificationTemplate(data: EmailNotificationData): string {
    const { type, submissionId, formData, submittedAt } = data
    
    // Extract common fields
    const name = formData.name || formData.full_name || 'Not provided'
    const email = formData.email || 'Not provided'
    const phone = formData.phone || formData.phone_number || 'Not provided'
    const message = formData.message || formData.comments || 'Not provided'
    
    // Trade-in specific fields
    const deviceType = formData.device_type || 'Not specified'
    const consoleType = formData.console_type || 'Not specified'
    const bodyCondition = formData.body_condition || 'Not specified'
    
    const isTradeIn = type === 'trade-in'
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>New Form Submission</title>
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
            background: ${isTradeIn ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)'}; 
            color: white; 
            padding: 30px; 
            text-align: center; 
          }
          .content { 
            padding: 30px; 
          }
          .field-group {
            background: #f8f9fa;
            border-left: 4px solid ${isTradeIn ? '#667eea' : '#4CAF50'};
            padding: 15px;
            margin: 15px 0;
            border-radius: 0 5px 5px 0;
          }
          .field-label {
            font-weight: bold;
            color: #555;
            margin-bottom: 5px;
          }
          .field-value {
            color: #333;
            font-size: 16px;
          }
          .submission-info {
            background: #e3f2fd;
            border: 1px solid #2196f3;
            border-radius: 8px;
            padding: 15px;
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
          .emoji { font-size: 24px; margin-bottom: 10px; }
          .action-button {
            background: ${isTradeIn ? '#667eea' : '#4CAF50'};
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 5px;
            display: inline-block;
            margin: 10px 5px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="emoji">${isTradeIn ? '🎮' : '📧'}</div>
            <h1>New ${isTradeIn ? 'Trade-In Request' : 'Contact Form'} Submitted</h1>
            <p>Form submitted at ${new Date(submittedAt).toLocaleString()}</p>
          </div>
          
          <div class="content">
            <div class="submission-info">
              <strong>Submission ID:</strong> ${submissionId}<br>
              <strong>Type:</strong> ${isTradeIn ? 'Trade-In Request' : 'Contact Form'}<br>
              <strong>Submitted:</strong> ${new Date(submittedAt).toLocaleString()}
            </div>

            <div class="field-group">
              <div class="field-label">Name:</div>
              <div class="field-value">${name}</div>
            </div>

            <div class="field-group">
              <div class="field-label">Email:</div>
              <div class="field-value">${email}</div>
            </div>

            <div class="field-group">
              <div class="field-label">Phone:</div>
              <div class="field-value">${phone}</div>
            </div>

            ${isTradeIn ? `
              <div class="field-group">
                <div class="field-label">Device Type:</div>
                <div class="field-value">${deviceType}</div>
              </div>

              <div class="field-group">
                <div class="field-label">Console Type:</div>
                <div class="field-value">${consoleType}</div>
              </div>

              <div class="field-group">
                <div class="field-label">Body Condition:</div>
                <div class="field-value">${bodyCondition}</div>
              </div>
            ` : ''}

            <div class="field-group">
              <div class="field-label">${isTradeIn ? 'Additional Comments:' : 'Message:'}</div>
              <div class="field-value">${message}</div>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="https://trade.rezult.co/dashboard/submissions" class="action-button">
                View in Dashboard
              </a>
              ${email !== 'Not provided' ? `<a href="mailto:${email}" class="action-button">Reply via Email</a>` : ''}
            </div>
          </div>
          
          <div class="footer">
            <p>This notification was sent from your TradeZone Dashboard.</p>
            <p>Visit your dashboard to manage and respond to submissions.</p>
          </div>
        </div>
      </body>
      </html>
    `
  }
}