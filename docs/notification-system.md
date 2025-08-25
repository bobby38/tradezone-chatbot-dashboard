# TradeZone Notification System Design

## Overview
This document outlines a comprehensive notification system for the TradeZone dashboard that integrates with n8n to send WhatsApp, Telegram, and other notifications based on form submissions, chat interactions, and system events.

## Architecture

### Components
1. **Dashboard Triggers** - Events from the TradeZone dashboard
2. **n8n Workflows** - Automation workflows for notification routing
3. **Notification Channels** - WhatsApp, Telegram, Email, SMS
4. **User Preferences** - Customizable notification settings

### Data Flow
```
Dashboard Event → Webhook → n8n Workflow → Channel Selection → Notification Delivery
```

## Implementation Plan

### Phase 1: n8n Webhook Integration

#### 1.1 Create n8n Webhook Endpoints
Create the following n8n workflows:

**Form Submission Notifications**
- Webhook URL: `https://your-n8n.domain.com/webhook/form-submission`
- Triggers on: New form submissions, urgent trade-in inquiries
- Channels: WhatsApp, Telegram, Email

**Chat Alerts**
- Webhook URL: `https://your-n8n.domain.com/webhook/chat-alert`
- Triggers on: High-value inquiries, support requests, errors
- Channels: Telegram for immediate alerts

**System Monitoring**
- Webhook URL: `https://your-n8n.domain.com/webhook/system-alert`
- Triggers on: Server issues, API failures, security events
- Channels: Telegram, Email

#### 1.2 n8n Workflow Examples

**WhatsApp Business API Integration**
```json
{
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "form-submission",
        "options": {}
      },
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "position": [240, 300]
    },
    {
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "={{$json.type}}",
              "operation": "equal",
              "value2": "trade_in"
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
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "url": "https://graph.facebook.com/v17.0/YOUR_PHONE_NUMBER_ID/messages",
        "sendBody": true,
        "bodyContentType": "json",
        "jsonBody": "={\n  \"messaging_product\": \"whatsapp\",\n  \"to\": \"+6591234567\",\n  \"type\": \"template\",\n  \"template\": {\n    \"name\": \"trade_in_alert\",\n    \"language\": {\n      \"code\": \"en_US\"\n    },\n    \"components\": [\n      {\n        \"type\": \"body\",\n        \"parameters\": [\n          {\n            \"type\": \"text\",\n            \"text\": \"{{$json.customerName}}\"\n          },\n          {\n            \"type\": \"text\",\n            \"text\": \"{{$json.deviceType}}\"\n          }\n        ]\n      }\n    ]\n  }\n}",
        "options": {}
      },
      "name": "Send WhatsApp",
      "type": "n8n-nodes-base.httpRequest",
      "position": [680, 200]
    }
  ]
}
```

**Telegram Bot Integration**
```json
{
  "nodes": [
    {
      "parameters": {
        "chatId": "@tradezone_alerts",
        "text": "=🚨 *New {{$json.type}} Submission*\n\n👤 *Customer:* {{$json.customerName}}\n📧 *Email:* {{$json.email}}\n📱 *Phone:* {{$json.phone}}\n\n💬 *Message:* {{$json.message}}\n\n⏰ *Time:* {{$json.timestamp}}\n\n[View in Dashboard]({{$json.dashboardUrl}})",
        "additionalFields": {
          "parse_mode": "Markdown"
        }
      },
      "name": "Telegram",
      "type": "n8n-nodes-base.telegram",
      "position": [680, 400]
    }
  ]
}
```

### Phase 2: Dashboard Integration

#### 2.1 Create Notification Service
```typescript
// /lib/notifications.ts
interface NotificationData {
  type: 'form_submission' | 'chat_alert' | 'system_alert'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  data: any
}

export class NotificationService {
  private static n8nWebhookBase = process.env.N8N_WEBHOOK_BASE

  static async sendNotification(notification: NotificationData) {
    const webhookUrl = `${this.n8nWebhookBase}/${notification.type}`
    
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.N8N_WEBHOOK_TOKEN}`
        },
        body: JSON.stringify({
          ...notification.data,
          priority: notification.priority,
          timestamp: new Date().toISOString(),
          dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`
        })
      })

      if (!response.ok) {
        console.error('Notification failed:', response.statusText)
      }
    } catch (error) {
      console.error('Notification error:', error)
    }
  }
}
```

#### 2.2 Integrate with Existing Systems

**Form Submissions**
```typescript
// In /app/api/webhook/fluent-forms/route.ts
import { NotificationService } from '@/lib/notifications'

// After successful form processing
if (submissionType === 'trade-in' || urgentKeywords.some(word => 
  JSON.stringify(formData).toLowerCase().includes(word)
)) {
  await NotificationService.sendNotification({
    type: 'form_submission',
    priority: 'high',
    data: {
      type: submissionType,
      customerName: formData.name,
      email: formData.email,
      phone: formData.phone,
      message: formData.message,
      deviceType: formData.device_type,
      urgentFlag: true
    }
  })
}
```

**Chat Monitoring**
```typescript
// In /app/api/n8n-chat/route.ts
// Add monitoring for high-value keywords
const highValueKeywords = ['buy', 'purchase', 'immediate', 'urgent', 'complaint']
const errorKeywords = ['error', 'problem', 'not working', 'broken']

if (highValueKeywords.some(word => prompt.toLowerCase().includes(word))) {
  await NotificationService.sendNotification({
    type: 'chat_alert',
    priority: 'medium',
    data: {
      sessionId,
      prompt: prompt.substring(0, 200),
      userId,
      alertType: 'high_value_inquiry'
    }
  })
}
```

### Phase 3: Notification Templates

#### 3.1 WhatsApp Business Templates
```
Template Name: trade_in_alert
Category: UTILITY

Header: 🔄 New Trade-in Request

Body: 
Hello! We have a new trade-in request:

Customer: {{1}}
Device: {{2}}
Condition: {{3}}

Please review and respond within 2 hours.

Footer: TradeZone Singapore
```

#### 3.2 Telegram Message Templates
```markdown
🚨 **New Trade-in Inquiry**

👤 **Customer:** John Doe
📧 **Email:** john@example.com
📱 **Phone:** +65 9123 4567

📱 **Device:** iPhone 14 Pro
🔧 **Condition:** Good
💰 **Expected Value:** $800

📝 **Notes:** Screen has minor scratches, battery health 89%

⏰ **Received:** 2024-08-25 14:30 SGT

🔗 [View Full Details](https://dashboard.tradezone.sg/submissions/123)
```

### Phase 4: Advanced Features

#### 4.1 Notification Rules Engine
```typescript
interface NotificationRule {
  id: string
  name: string
  condition: {
    field: string
    operator: 'contains' | 'equals' | 'greater_than' | 'less_than'
    value: string | number
  }[]
  actions: {
    channel: 'whatsapp' | 'telegram' | 'email' | 'sms'
    recipients: string[]
    template: string
    delay?: number
  }[]
  active: boolean
}

// Example rules
const notificationRules: NotificationRule[] = [
  {
    id: 'urgent-trade-ins',
    name: 'Urgent Trade-in Notifications',
    condition: [
      { field: 'type', operator: 'equals', value: 'trade-in' },
      { field: 'device_value', operator: 'greater_than', value: 500 }
    ],
    actions: [
      {
        channel: 'whatsapp',
        recipients: ['+6591234567'],
        template: 'trade_in_alert'
      },
      {
        channel: 'telegram',
        recipients: ['@tradezone_team'],
        template: 'urgent_tradein_telegram'
      }
    ],
    active: true
  }
]
```

#### 4.2 User Notification Preferences
```typescript
// Database schema for user notification preferences
interface UserNotificationSettings {
  user_id: string
  channels: {
    whatsapp: { enabled: boolean; number?: string }
    telegram: { enabled: boolean; chat_id?: string }
    email: { enabled: boolean; address?: string }
    sms: { enabled: boolean; number?: string }
  }
  events: {
    form_submissions: boolean
    high_value_chats: boolean
    system_alerts: boolean
    daily_summary: boolean
  }
  quiet_hours: {
    enabled: boolean
    start_time: string // "22:00"
    end_time: string   // "08:00"
    timezone: string   // "Asia/Singapore"
  }
}
```

#### 4.3 Notification Analytics Dashboard
```typescript
// Track notification delivery and engagement
interface NotificationMetrics {
  total_sent: number
  delivery_rate: number
  read_rate: number
  response_rate: number
  channel_performance: {
    whatsapp: { sent: number; delivered: number; read: number }
    telegram: { sent: number; delivered: number; read: number }
    email: { sent: number; delivered: number; opened: number }
  }
}
```

## Environment Variables
```env
# n8n Integration
N8N_WEBHOOK_BASE=https://your-n8n.domain.com/webhook
N8N_WEBHOOK_TOKEN=your-secure-webhook-token

# WhatsApp Business API
WHATSAPP_ACCESS_TOKEN=your-whatsapp-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_VERIFY_TOKEN=your-verify-token

# Telegram Bot
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_CHAT_ID=your-default-chat-id

# Notification Settings
NOTIFICATION_DEFAULT_RECIPIENTS=+6591234567,@tradezone_alerts
NOTIFICATION_QUIET_HOURS=22:00-08:00
```

## Security Considerations

### 1. Webhook Security
- Use HTTPS only
- Implement webhook token validation
- Rate limiting on webhook endpoints
- IP whitelisting for n8n server

### 2. Data Privacy
- Mask sensitive information in notifications
- Implement opt-out mechanisms
- Store minimal personal data in notification logs
- Comply with PDPA/GDPR requirements

### 3. Access Control
- Role-based notification permissions
- Audit logs for all notifications sent
- Secure credential storage in n8n
- Regular token rotation

## Testing Strategy

### 1. Integration Testing
```bash
# Test form submission notification
curl -X POST https://dashboard.tradezone.sg/api/test-notifications \
  -H "Content-Type: application/json" \
  -d '{
    "type": "form_submission",
    "data": {
      "customerName": "Test User",
      "email": "test@example.com",
      "deviceType": "iPhone 15 Pro"
    }
  }'
```

### 2. End-to-End Testing
1. Submit test form → Check WhatsApp/Telegram notifications
2. Send test chat → Verify alert delivery
3. Trigger system error → Confirm monitoring alerts
4. Test quiet hours functionality
5. Verify notification preferences work correctly

## Monitoring and Maintenance

### 1. Health Checks
- Monitor n8n workflow status
- Track notification delivery rates  
- Alert on failed webhook calls
- Monitor channel API quotas

### 2. Performance Monitoring
- Notification latency tracking
- Channel response times
- Error rate monitoring
- User engagement metrics

### 3. Regular Maintenance
- Review and update notification rules
- Clean up old notification logs
- Update channel API integrations
- Audit user preferences and permissions

## Deployment Checklist

- [ ] Set up n8n workflows
- [ ] Configure WhatsApp Business API
- [ ] Set up Telegram bot
- [ ] Implement notification service
- [ ] Add environment variables
- [ ] Test all notification channels
- [ ] Set up monitoring dashboards
- [ ] Create user documentation
- [ ] Train team on notification management
- [ ] Implement security measures

## Future Enhancements

1. **AI-Powered Notification Intelligence**
   - Smart notification timing based on user behavior
   - Content optimization for better engagement
   - Automatic priority classification

2. **Multi-language Support**
   - Localized notification templates
   - Language detection for customers
   - Timezone-aware scheduling

3. **Advanced Analytics**
   - Notification ROI tracking
   - Customer response correlation
   - Predictive notification scheduling

4. **Integration Expansion**
   - Discord notifications for developer team
   - Slack integration for business teams
   - Push notifications for mobile app
   - Voice call alerts for critical issues

This comprehensive notification system will significantly improve customer response times and team coordination while providing valuable insights into customer behavior and preferences.