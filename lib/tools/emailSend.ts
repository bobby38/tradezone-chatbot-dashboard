/**
 * Email Send Tool
 * Handles trade-in requests and contact form submissions
 */

export const emailSendTool = {
  type: 'function' as const,
  function: {
    name: 'sendemail',
    description: 'Send an email for trade-in requests or customer inquiries. Only use when customer explicitly requests to be contacted or wants to submit a trade-in.',
    parameters: {
      type: 'object',
      properties: {
        emailType: {
          type: 'string',
          enum: ['trade_in', 'info_request', 'contact'],
          description: 'Type of email: trade_in for device trade-ins, info_request for product inquiries, contact for general contact'
        },
        name: {
          type: 'string',
          description: 'Customer full name'
        },
        email: {
          type: 'string',
          description: 'Customer email address'
        },
        message: {
          type: 'string',
          description: 'Customer message or inquiry details'
        },
        deviceModel: {
          type: 'string',
          description: 'For trade-ins: device model (e.g., iPhone 14 Pro, PS5)'
        },
        deviceCondition: {
          type: 'string',
          description: 'For trade-ins: device condition (e.g., Excellent, Good, Fair)'
        }
      },
      required: ['emailType', 'name', 'email', 'message']
    }
  }
}

/**
 * Handler function for sending emails
 * Creates submission record and sends notification email
 */
export async function handleEmailSend(params: {
  emailType: 'trade_in' | 'info_request' | 'contact'
  name: string
  email: string
  message: string
  deviceModel?: string
  deviceCondition?: string
}): Promise<string> {
  try {
    // Call your existing submission API or email service
    const response = await fetch('/api/submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content_type: 'Chat Submission',
        sender_email: params.email,
        sender_name: params.name,
        message: params.message,
        source: 'chatkit',
        ai_metadata: {
          email_type: params.emailType,
          device_model: params.deviceModel,
          device_condition: params.deviceCondition
        }
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Email submission error:', error)
      throw new Error(`Failed to send email: ${error.error || 'Unknown error'}`)
    }

    const result = await response.json()

    // Return confirmation message
    if (params.emailType === 'trade_in') {
      return `Thanks, ${params.name}! I've sent your trade-in request for the ${params.deviceModel} to our team. They'll email you at ${params.email} with a quote within 24 hours.`
    } else {
      return `Thanks, ${params.name}! I've passed your inquiry to our team. They'll respond to ${params.email} shortly.`
    }
  } catch (error) {
    console.error('Error sending email:', error)
    return 'I encountered an error submitting your request. Please try contacting us directly at contactus@tradezone.sg or call +65 6123 4567.'
  }
}
