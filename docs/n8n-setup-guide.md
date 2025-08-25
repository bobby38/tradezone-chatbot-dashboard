# Complete n8n Notification Setup Guide for TradeZone

## Overview
This guide will walk you through setting up automated notifications using n8n for your TradeZone dashboard, including WhatsApp, Telegram, and email alerts.

## Prerequisites
- n8n instance (self-hosted or n8n.cloud)
- WhatsApp Business API access (Meta Business)
- Telegram Bot token
- SMTP email service

## Phase 1: n8n Installation & Setup

### Option A: n8n Cloud (Recommended for beginners)
1. Go to [n8n.cloud](https://n8n.cloud)
2. Create account and set up workspace
3. Note your webhook base URL: `https://[your-instance].app.n8n.cloud/webhook`

### Option B: Self-hosted n8n
```bash
# Using Docker Compose
version: '3.7'
services:
  n8n:
    image: n8nio/n8n
    restart: always
    ports:
      - "5678:5678"
    environment:
      - WEBHOOK_URL=https://your-domain.com
      - GENERIC_TIMEZONE=Asia/Singapore
    volumes:
      - n8n_data:/home/node/.n8n
    
volumes:
  n8n_data:
```

## Phase 2: WhatsApp Business API Setup

### 2.1 Meta Business Setup
1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create a new App → Business → WhatsApp
3. Set up WhatsApp Business API
4. Get your credentials:
   - Phone Number ID
   - Access Token
   - App Secret

### 2.2 Create WhatsApp Message Template
Required for business messaging:

**Template Name:** `tradezone_form_alert`
**Category:** UTILITY
**Language:** English (US)

**Template Content:**
```
🔔 New Form Submission - TradeZone

Customer: {{1}}
Type: {{2}}
Email: {{3}}

{{4}}

View details: {{5}}
```

**Template Variables:**
1. Customer Name
2. Form Type (Contact/Trade-in)
3. Email Address
4. Message/Details
5. Dashboard Link

## Phase 3: Telegram Bot Setup

### 3.1 Create Telegram Bot
1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot`
3. Follow instructions to create bot
4. Save the Bot Token: `123456789:ABCdefGHIjklMNOPqrsTUVwxyz`

### 3.2 Create Notification Channel/Group
1. Create a new Telegram channel/group
2. Add your bot as administrator
3. Get Chat ID using this method:
   ```bash
   # Send a message to your bot, then:
   curl https://api.telegram.org/bot[BOT_TOKEN]/getUpdates
   ```

## Phase 4: n8n Workflow Creation

### 4.1 Form Submission Workflow

Create a new workflow in n8n:

#### Node 1: Webhook Trigger
- **Type:** Webhook
- **Path:** `form-submission`
- **Method:** POST
- **Response Code:** 200

#### Node 2: Classification Logic
- **Type:** IF
- **Condition:** `{{ $json.type === 'trade-in' }}`

#### Node 3a: WhatsApp (Trade-in Branch)
- **Type:** HTTP Request
- **URL:** `https://graph.facebook.com/v18.0/[PHONE_NUMBER_ID]/messages`
- **Method:** POST
- **Headers:**
  ```json
  {
    "Authorization": "Bearer [ACCESS_TOKEN]",
    "Content-Type": "application/json"
  }
  ```
- **Body:**
  ```json
  {
    "messaging_product": "whatsapp",
    "to": "+6591234567",
    "type": "template",
    "template": {
      "name": "tradezone_form_alert",
      "language": { "code": "en_US" },
      "components": [{
        "type": "body",
        "parameters": [
          { "type": "text", "text": "{{ $json.customerName }}" },
          { "type": "text", "text": "{{ $json.formType }}" },
          { "type": "text", "text": "{{ $json.email }}" },
          { "type": "text", "text": "{{ $json.message }}" },
          { "type": "text", "text": "{{ $json.dashboardUrl }}" }
        ]
      }]
    }
  }
  ```

#### Node 3b: Telegram (Contact Form Branch)
- **Type:** Telegram
- **Chat ID:** `@your_channel`
- **Message:**
  ```markdown
  📩 *New Contact Form*
  
  👤 *Customer:* {{ $json.customerName }}
  📧 *Email:* {{ $json.email }}
  📱 *Phone:* {{ $json.phone }}
  
  💬 *Message:*
  {{ $json.message }}
  
  ⏰ *Received:* {{ $json.timestamp }}
  
  [View in Dashboard]({{ $json.dashboardUrl }})
  ```

#### Node 4: Email Notification (Both Branches)
- **Type:** Email Send
- **SMTP Settings:** Your email provider
- **Subject:** `New {{ $json.formType }} - {{ $json.customerName }}`
- **Body:** HTML template with customer details

### 4.2 Export Workflow JSON
```json
{
  "name": "TradeZone Form Notifications",
  "nodes": [
    {
      "parameters": {
        "path": "form-submission",
        "options": {}
      },
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "position": [240, 300],
      "webhookId": "form-submission-hook"
    },
    {
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "={{ $json.formType }}",
              "operation": "equal",
              "value2": "trade-in"
            }
          ]
        }
      },
      "name": "Is Trade-in?",
      "type": "n8n-nodes-base.if",
      "position": [460, 300]
    },
    {
      "parameters": {
        "url": "https://graph.facebook.com/v18.0/YOUR_PHONE_ID/messages",
        "sendBody": true,
        "bodyContentType": "json",
        "jsonBody": "={{ JSON.stringify({\n  messaging_product: 'whatsapp',\n  to: '+6591234567',\n  type: 'template',\n  template: {\n    name: 'tradezone_form_alert',\n    language: { code: 'en_US' },\n    components: [{\n      type: 'body',\n      parameters: [\n        { type: 'text', text: $json.customerName },\n        { type: 'text', text: $json.formType },\n        { type: 'text', text: $json.email },\n        { type: 'text', text: $json.message },\n        { type: 'text', text: $json.dashboardUrl }\n      ]\n    }]\n  }\n}) }}",
        "options": {
          "headers": {
            "Authorization": "Bearer YOUR_ACCESS_TOKEN"
          }
        }
      },
      "name": "WhatsApp Alert",
      "type": "n8n-nodes-base.httpRequest",
      "position": [680, 200]
    },
    {
      "parameters": {
        "chatId": "@tradezone_alerts",
        "text": "=📩 *New Contact Form*\n\n👤 *Customer:* {{ $json.customerName }}\n📧 *Email:* {{ $json.email }}\n📱 *Phone:* {{ $json.phone }}\n\n💬 *Message:*\n{{ $json.message }}\n\n⏰ *Received:* {{ $json.timestamp }}\n\n[View Dashboard]({{ $json.dashboardUrl }})",
        "additionalFields": {
          "parse_mode": "Markdown"
        }
      },
      "name": "Telegram Alert",
      "type": "n8n-nodes-base.telegram",
      "position": [680, 400]
    }
  ],
  "connections": {
    "Webhook": {
      "main": [
        [
          {
            "node": "Is Trade-in?",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Is Trade-in?": {
      "main": [
        [
          {
            "node": "WhatsApp Alert",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Telegram Alert",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

## Phase 5: Dashboard Integration

### 5.1 Update Environment Variables
Add to your `.env.local`:
```env
# n8n Integration
N8N_WEBHOOK_BASE=https://your-n8n-instance.com/webhook
N8N_WEBHOOK_TOKEN=your-secure-webhook-token

# WhatsApp Business API
WHATSAPP_ACCESS_TOKEN=your-whatsapp-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id

# Telegram Bot
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_CHAT_ID=your-default-chat-id

# Notification Recipients
NOTIFICATION_RECIPIENTS=+6591234567,@tradezone_alerts,admin@tradezone.sg
```

### 5.2 Create Notification Service
Already created at `/lib/notifications.ts` - Review and update webhook URLs.

### 5.3 Integrate with Existing Webhooks
Update `/app/api/webhook/fluent-forms/route.ts`:
```typescript
// Add after successful form processing
import { NotificationService } from '@/lib/notifications'

// Determine priority based on form content
const isUrgent = formData.message?.toLowerCase().includes('urgent') || 
                formData.device_type === 'iPhone 15' ||
                formData.subject?.toLowerCase().includes('complaint')

await NotificationService.sendNotification({
  type: 'form_submission',
  priority: isUrgent ? 'urgent' : 'medium',
  data: {
    customerName: formData.name || 'Anonymous',
    email: formData.email,
    phone: formData.phone,
    formType: submissionType,
    message: formData.message || formData.subject,
    deviceType: formData.device_type,
    timestamp: new Date().toISOString(),
    dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/submissions`
  }
})
```

## Phase 6: Testing & Validation

### 6.1 Test Webhook Endpoint
```bash
# Test n8n webhook
curl -X POST https://your-n8n-instance.com/webhook/form-submission \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "Test Customer",
    "email": "test@example.com",
    "formType": "trade-in",
    "message": "Testing notification system",
    "timestamp": "2024-08-25T10:00:00Z",
    "dashboardUrl": "https://dashboard.tradezone.sg"
  }'
```

### 6.2 Test Dashboard Integration
```bash
# Submit test form through your dashboard
curl -X POST https://your-domain.com/api/webhook/fluent-forms \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "name": "Test Customer",
      "email": "test@example.com",
      "message": "Test notification integration",
      "device_type": "iPhone 14"
    },
    "form_id": "1"
  }'
```

## Phase 7: Advanced Configuration

### 7.1 Smart Routing Rules
Create multiple workflows for different scenarios:
- **High Priority:** Trade-ins > $1000 → WhatsApp + Telegram
- **Medium Priority:** General inquiries → Telegram only  
- **Low Priority:** Newsletter signups → Email only

### 7.2 Quiet Hours Implementation
Add to n8n workflow:
```javascript
// Function node to check time
const now = new Date();
const hour = now.getHours();
const isQuietHours = hour >= 22 || hour <= 8; // 10 PM - 8 AM

if (isQuietHours) {
  // Store notification for morning delivery
  return { postpone: true, sendAt: '08:00' };
}

return { sendNow: true };
```

### 7.3 Rate Limiting
Implement rate limiting to avoid spam:
```javascript
// Store in n8n memory/database
const key = `notifications_${$json.email}`;
const count = $memory.get(key) || 0;

if (count > 5) { // Max 5 notifications per hour
  return { blocked: true, reason: 'Rate limited' };
}

$memory.set(key, count + 1, 3600); // 1 hour TTL
```

## Phase 8: Monitoring & Maintenance

### 8.1 Notification Logs
Add logging to track delivery:
```javascript
// In n8n workflow
$memory.set(`notification_${Date.now()}`, {
  type: $json.formType,
  recipient: $json.phone || $json.chatId,
  status: 'sent',
  timestamp: new Date().toISOString()
});
```

### 8.2 Health Checks
Create a monitoring workflow:
- Check WhatsApp API status
- Verify Telegram bot connectivity  
- Test webhook endpoints
- Alert if any service is down

### 8.3 Analytics Dashboard
Track notification effectiveness:
- Delivery rates by channel
- Response times
- User engagement metrics
- Failed notification alerts

## Troubleshooting

### Common Issues

**1. WhatsApp Template Rejection**
- Ensure template follows Meta guidelines
- Use only approved message templates
- Check template status in Meta Business Manager

**2. Telegram Bot Not Receiving**
- Verify bot token is correct
- Check if bot is admin in channel/group
- Ensure chat ID is correct format

**3. n8n Webhook Timeouts**
- Increase timeout settings
- Add retry logic
- Check network connectivity

**4. Rate Limiting**
- Monitor API quotas
- Implement exponential backoff
- Use queue system for high volume

### Debug Commands
```bash
# Test WhatsApp API
curl -X POST "https://graph.facebook.com/v18.0/[PHONE_ID]/messages" \
  -H "Authorization: Bearer [TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{"messaging_product": "whatsapp", "to": "[PHONE]", "type": "text", "text": {"body": "Test message"}}'

# Test Telegram Bot
curl -X POST "https://api.telegram.org/bot[BOT_TOKEN]/sendMessage" \
  -d "chat_id=[CHAT_ID]&text=Test message"

# Check n8n webhook logs
curl https://your-n8n-instance.com/webhook-test/form-submission
```

## Security Best Practices

1. **API Keys:** Store in n8n credentials, never in workflow
2. **Webhook Security:** Use tokens, IP whitelisting
3. **Data Privacy:** Mask sensitive information
4. **Access Control:** Limit n8n workflow access
5. **Audit Logs:** Enable logging for all notifications

## Production Deployment Checklist

- [ ] WhatsApp Business API approved and active
- [ ] Telegram bot created and configured
- [ ] n8n workflows imported and tested
- [ ] Environment variables configured
- [ ] Webhook endpoints secured
- [ ] Rate limiting implemented
- [ ] Monitoring dashboard setup
- [ ] Error alerting configured
- [ ] Documentation updated
- [ ] Team training completed

This complete setup will give you professional, automated notifications for your TradeZone dashboard with multi-channel delivery and intelligent routing!