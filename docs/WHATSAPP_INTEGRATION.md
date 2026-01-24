# WhatsApp API Integration Guide

**Status:** 📋 Planned Future Enhancement  
**Feasibility:** ✅ Fully Compatible  
**Estimated Effort:** 1-2 weeks  
**Last Updated:** 2025-01-27

---

## Executive Summary

The TradeZone chatbot system is **fully compatible** with WhatsApp Business API integration. The existing modular, webhook-based architecture requires minimal changes to support WhatsApp as an additional channel alongside the current web chat.

**Key Advantages:**
- ✅ Existing infrastructure supports multi-channel design
- ✅ Session management already built for external webhooks
- ✅ Trade-in service supports multiple channels
- ✅ n8n workflow system can handle WhatsApp webhooks
- ✅ Same AI engine, same features, different interface

---

## Table of Contents

- [Current Architecture](#current-architecture)
- [Integration Strategy](#integration-strategy)
- [Implementation Options](#implementation-options)
- [Technical Specifications](#technical-specifications)
- [Implementation Checklist](#implementation-checklist)
- [Cost Analysis](#cost-analysis)
- [Security Considerations](#security-considerations)
- [Code Examples](#code-examples)

---

## Current Architecture

### Existing Flow
```
Current Multi-Channel Architecture:
┌─────────────────────────────────────────────────────────────┐
│  Input Channels                                             │
├─────────────────────────────────────────────────────────────┤
│  • Web Widget → /api/chatkit/agent                          │
│  • n8n Webhook → /api/n8n-chat                              │
│  • Voice Chat → /api/chatkit/realtime                       │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Core Processing Layer                                      │
├─────────────────────────────────────────────────────────────┤
│  • OpenAI GPT-4.1-mini (ChatKit Agent)                       │
│  • Vector Search (Product Catalog)                          │
│  • Perplexity AI (Web Search)                               │
│  • Trade-In Service (Multi-channel)                         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Data Layer                                                 │
├─────────────────────────────────────────────────────────────┤
│  • Supabase (chat_logs, chat_sessions)                      │
│  • Session Management (Guest-XX, user-based)                │
│  • Media Storage (Supabase Storage)                         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Dashboard                                                  │
├─────────────────────────────────────────────────────────────┤
│  • Conversation History                                     │
│  • Analytics & Monitoring                                   │
│  • Trade-In Management                                      │
└─────────────────────────────────────────────────────────────┘
```

### WhatsApp Integration Points

The system has **three ideal integration points**:

1. **n8n Workflow** (`/api/n8n-chat`) - Already handles external webhooks
2. **ChatKit Agent** (`/api/chatkit/agent`) - Core AI processing
3. **Trade-In Service** (`lib/trade-in/service.ts`) - Multi-channel support

---

## Integration Strategy

### Recommended Approach: n8n Integration ⭐

**Why n8n?**
- Already deployed and operational
- Visual workflow builder (no code changes)
- Built-in error handling and retry logic
- Easy to debug and modify
- Supports webhooks out of the box

### Proposed Flow

```
WhatsApp User sends message
          ↓
WhatsApp Business API (webhook)
          ↓
n8n Workflow:
  ├─ Step 1: Receive webhook
  ├─ Step 2: Parse message (text/media)
  ├─ Step 3: Get conversation history from Supabase
  ├─ Step 4: Call /api/chatkit/agent
  ├─ Step 5: Format response for WhatsApp
  ├─ Step 6: Send via WhatsApp API
  └─ Step 7: Log to /api/n8n-chat
          ↓
Supabase (chat_logs with source='whatsapp')
          ↓
Dashboard (view WhatsApp conversations)
```

---

## Implementation Options

### Option 1: n8n Integration (Recommended)

**Pros:**
- ✅ No code changes in dashboard
- ✅ Uses existing infrastructure
- ✅ Visual workflow builder
- ✅ Easy to debug
- ✅ Can be deployed in hours

**Cons:**
- ⚠️ Additional n8n workflow to maintain
- ⚠️ Slight latency vs direct API

**Estimated Time:** 3-5 days

### Option 2: Direct API Integration

Create dedicated WhatsApp endpoint:

**Pros:**
- ✅ Direct control
- ✅ Lower latency
- ✅ Custom business logic

**Cons:**
- ⚠️ Requires new endpoint
- ⚠️ Webhook verification needed
- ⚠️ More maintenance

**Estimated Time:** 1-2 weeks

### Option 3: Hybrid Approach

Use n8n for webhook handling, direct API for critical paths.

**Estimated Time:** 1 week

---

## Technical Specifications

### Database Schema Changes

```sql
-- Add WhatsApp support to existing enums
ALTER TYPE chat_channel ADD VALUE IF NOT EXISTS 'whatsapp';
ALTER TYPE trade_in_channel ADD VALUE IF NOT EXISTS 'whatsapp';

-- Create WhatsApp-specific view
CREATE VIEW whatsapp_conversations AS
SELECT 
  cl.*,
  cs.session_name,
  cs.status as session_status
FROM chat_logs cl
LEFT JOIN chat_sessions cs ON cl.session_id = cs.session_id
WHERE cl.source = 'whatsapp'
ORDER BY cl.created_at DESC;

-- Add WhatsApp metadata columns (optional)
ALTER TABLE chat_logs ADD COLUMN IF NOT EXISTS whatsapp_message_id TEXT;
ALTER TABLE chat_logs ADD COLUMN IF NOT EXISTS whatsapp_phone_number TEXT;
```

### Session Management

**Current Pattern:**
```typescript
session_id: "Guest-61"
user_id: "anonymous"
```

**WhatsApp Pattern:**
```typescript
session_id: "whatsapp-6581234567"
user_id: "whatsapp:+6581234567"
```

### Compatibility Matrix

| Feature | Current Chat | WhatsApp | Implementation Notes |
|---------|-------------|----------|----------------------|
| Text messages | ✅ | ✅ | Direct 1:1 mapping |
| Images | ✅ | ✅ | Download → Supabase Storage |
| Videos | ✅ | ✅ | Same as images |
| Audio | ❌ | ✅ | New feature opportunity |
| Documents | ❌ | ✅ | PDF support possible |
| Session management | ✅ | ✅ | Use phone number as ID |
| History tracking | ✅ | ✅ | Same database schema |
| Trade-in flow | ✅ | ✅ | Already multi-channel |
| Product search | ✅ | ✅ | Same vector store |
| Email notifications | ✅ | ✅ | No changes needed |
| Rate limiting | ✅ | ✅ | By phone number |
| Cost tracking | ✅ | ✅ | Same monitoring tables |

---

## Implementation Checklist

### Phase 1: Setup (1-2 days)

- [ ] **WhatsApp Business Account**
  - [ ] Create Meta Business account
  - [ ] Set up WhatsApp Business API
  - [ ] Get phone number ID
  - [ ] Generate access token
  - [ ] Configure webhook URL

- [ ] **Environment Variables**
  ```bash
  WHATSAPP_TOKEN=EAAxxxxxxxxxxxxxxxx
  WHATSAPP_PHONE_NUMBER_ID=123456789
  WHATSAPP_APP_SECRET=your-app-secret
  WHATSAPP_BUSINESS_ACCOUNT_ID=123456789
  WHATSAPP_VERIFY_TOKEN=your-verify-token
  WHATSAPP_WEBHOOK_URL=https://trade.rezult.co/api/whatsapp/webhook
  ```

- [ ] **Test Environment**
  - [ ] Set up test phone number
  - [ ] Configure webhook in Meta dashboard
  - [ ] Test sending/receiving messages

### Phase 2: n8n Workflow (2-3 days)

- [ ] **Webhook Receiver**
  - [ ] Create n8n webhook trigger
  - [ ] Verify WhatsApp signature
  - [ ] Parse incoming message structure
  - [ ] Handle text, images, videos

- [ ] **Message Processing**
  - [ ] Query Supabase for conversation history
  - [ ] Format history for ChatKit
  - [ ] Call `/api/chatkit/agent`
  - [ ] Handle tool calls (product search, trade-in)

- [ ] **Response Handling**
  - [ ] Format ChatKit response for WhatsApp
  - [ ] Convert markdown to WhatsApp formatting
  - [ ] Split long messages (WhatsApp 4096 char limit)
  - [ ] Handle media responses

- [ ] **WhatsApp API Integration**
  - [ ] Send text messages
  - [ ] Send media messages
  - [ ] Handle delivery receipts
  - [ ] Error handling & retries

- [ ] **Logging**
  - [ ] Call `/api/n8n-chat` to log conversation
  - [ ] Store media references
  - [ ] Track message status

### Phase 3: Database Migration (1 day)

- [ ] **Schema Updates**
  - [ ] Run SQL migration (see Technical Specifications)
  - [ ] Create WhatsApp-specific indexes
  - [ ] Set up materialized views

- [ ] **RLS Policies**
  - [ ] Extend existing policies for 'whatsapp' source
  - [ ] Media access policies
  - [ ] Session isolation

### Phase 4: Testing (1-2 days)

- [ ] **End-to-End Flow**
  - [ ] Send message → Receive response
  - [ ] Multi-turn conversation
  - [ ] Session persistence
  - [ ] History retrieval

- [ ] **Media Handling**
  - [ ] Send image → AI processes
  - [ ] Trade-in photos
  - [ ] Video uploads

- [ ] **Trade-In Flow**
  - [ ] Complete trade-in via WhatsApp
  - [ ] Photo upload
  - [ ] Email notification
  - [ ] Dashboard visibility

- [ ] **Error Scenarios**
  - [ ] Rate limiting
  - [ ] Invalid media
  - [ ] API timeouts
  - [ ] Webhook failures

### Phase 5: Dashboard Updates (Optional, 1 day)

- [ ] **UI Enhancements**
  - [ ] WhatsApp badge/icon
  - [ ] Phone number display
  - [ ] WhatsApp-specific filters
  - [ ] Media preview

- [ ] **Analytics**
  - [ ] WhatsApp vs Web chat metrics
  - [ ] Channel comparison
  - [ ] Conversion tracking

### Phase 6: Production Rollout (1 day)

- [ ] **Final Checks**
  - [ ] Security audit
  - [ ] Rate limit configuration
  - [ ] Cost monitoring
  - [ ] Webhook reliability

- [ ] **Launch**
  - [ ] Update production environment variables
  - [ ] Deploy n8n workflow
  - [ ] Configure WhatsApp webhook
  - [ ] Monitor first conversations

- [ ] **Documentation**
  - [ ] Update README
  - [ ] Staff training guide
  - [ ] Troubleshooting guide

---

## Cost Analysis

### WhatsApp Business API Pricing

| Region | Cost per Message | Notes |
|--------|------------------|-------|
| Singapore | $0.0376 - $0.0564 | User-initiated |
| Singapore | $0.0940 - $0.1410 | Business-initiated |
| Malaysia | $0.0412 - $0.0618 | User-initiated |
| Global Average | $0.005 - $0.09 | Varies by country |

**Free Tier:** 1,000 user-initiated conversations/month

### Combined Cost Estimate

| Component | Monthly Cost | Notes |
|-----------|--------------|-------|
| WhatsApp API | $50 - $200 | 5K messages (after free tier) |
| OpenAI API | Same as current | ~$0.30 per 1K messages |
| Supabase | Same as current | No additional cost |
| n8n | $0 | Self-hosted |
| **Total Additional** | **$50 - $200** | For 5K WhatsApp messages/month |

### ROI Considerations

**Benefits:**
- 📈 **Higher engagement** - WhatsApp has 98% open rate vs 20% email
- ⚡ **Faster response times** - Real-time vs delayed web chat
- 🌍 **Broader reach** - 2B+ WhatsApp users globally
- 💼 **Better conversions** - Direct communication channel
- 📊 **Rich media support** - Images, videos, documents

**Break-even:** ~10 additional sales/month (assuming $50 margin/sale)

---

## Security Considerations

### Webhook Verification

WhatsApp sends a signature with each webhook request:

```typescript
function verifyWhatsAppSignature(
  payload: string, 
  signature: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', process.env.WHATSAPP_APP_SECRET!)
    .update(payload)
    .digest('hex');
  
  return signature === `sha256=${expectedSignature}`;
}
```

### Rate Limiting

Adapt existing rate limiting for WhatsApp:

```typescript
// Current: By IP and session
// WhatsApp: By phone number

const phoneRateLimit = applyRateLimit(
  phoneNumber,
  RATE_LIMITS.WHATSAPP_PER_PHONE, // e.g., 30 req/hr
  "/api/whatsapp/webhook"
);
```

### Data Privacy

**PDPA Compliance:**
- Store phone numbers encrypted
- Add data retention policies
- Provide opt-out mechanism
- Log consent timestamps

```sql
-- Add privacy columns
ALTER TABLE chat_logs ADD COLUMN consent_given BOOLEAN DEFAULT false;
ALTER TABLE chat_logs ADD COLUMN consent_timestamp TIMESTAMPTZ;
ALTER TABLE chat_logs ADD COLUMN data_retention_days INTEGER DEFAULT 90;
```

### Access Control

```typescript
// Restrict WhatsApp conversations to authorized staff
const { data, error } = await supabase
  .from('chat_logs')
  .select('*')
  .eq('source', 'whatsapp')
  .rpc('check_whatsapp_access', { user_id: currentUser.id });
```

---

## Code Examples

### Option 1: n8n Workflow (JSON Export)

```json
{
  "name": "WhatsApp to ChatKit Integration",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "whatsapp-webhook",
        "responseMode": "onReceived",
        "options": {}
      },
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "position": [250, 300]
    },
    {
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "={{$json[\"entry\"][0][\"changes\"][0][\"value\"][\"messages\"]}}",
              "operation": "isNotEmpty"
            }
          ]
        }
      },
      "name": "Has Message?",
      "type": "n8n-nodes-base.if",
      "position": [450, 300]
    },
    {
      "parameters": {
        "functionCode": "// Extract WhatsApp message data\nconst entry = items[0].json.entry[0];\nconst change = entry.changes[0];\nconst message = change.value.messages[0];\nconst contact = change.value.contacts[0];\n\nreturn [{\n  json: {\n    from: message.from,\n    messageId: message.id,\n    timestamp: message.timestamp,\n    text: message.text?.body || '',\n    mediaUrl: message.image?.id || message.video?.id || null,\n    contactName: contact.profile.name\n  }\n}];"
      },
      "name": "Parse Message",
      "type": "n8n-nodes-base.function",
      "position": [650, 200]
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT * FROM chat_logs WHERE session_id = 'whatsapp-{{$json[\"from\"]}}' ORDER BY created_at DESC LIMIT 10"
      },
      "name": "Get History",
      "type": "n8n-nodes-base.supabase",
      "position": [850, 200]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://trade.rezult.co/api/chatkit/agent",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "X-API-Key",
              "value": "={{$env.CHATKIT_API_KEY}}"
            }
          ]
        },
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            {
              "name": "message",
              "value": "={{$json[\"text\"]}}"
            },
            {
              "name": "sessionId",
              "value": "whatsapp-{{$json[\"from\"]}}"
            },
            {
              "name": "history",
              "value": "={{$node[\"Get History\"].json}}"
            }
          ]
        }
      },
      "name": "Call ChatKit",
      "type": "n8n-nodes-base.httpRequest",
      "position": [1050, 200]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://graph.facebook.com/v18.0/{{$env.WHATSAPP_PHONE_NUMBER_ID}}/messages",
        "authentication": "genericCredentialType",
        "genericAuthType": "oAuth2Api",
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            {
              "name": "messaging_product",
              "value": "whatsapp"
            },
            {
              "name": "to",
              "value": "={{$json[\"from\"]}}"
            },
            {
              "name": "text",
              "value": "={\"body\": \"{{$node[\"Call ChatKit\"].json[\"response\"]}}\"}"
            }
          ]
        }
      },
      "name": "Send WhatsApp Message",
      "type": "n8n-nodes-base.httpRequest",
      "position": [1250, 200]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://trade.rezult.co/api/n8n-chat",
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            {
              "name": "user_id",
              "value": "whatsapp:{{$json[\"from\"]}}"
            },
            {
              "name": "prompt",
              "value": "={{$json[\"text\"]}}"
            },
            {
              "name": "response",
              "value": "={{$node[\"Call ChatKit\"].json[\"response\"]}}"
            },
            {
              "name": "session_id",
              "value": "whatsapp-{{$json[\"from\"]}}"
            }
          ]
        }
      },
      "name": "Log to Database",
      "type": "n8n-nodes-base.httpRequest",
      "position": [1450, 200]
    }
  ],
  "connections": {
    "Webhook": {
      "main": [[{ "node": "Has Message?", "type": "main", "index": 0 }]]
    },
    "Has Message?": {
      "main": [[{ "node": "Parse Message", "type": "main", "index": 0 }]]
    },
    "Parse Message": {
      "main": [[{ "node": "Get History", "type": "main", "index": 0 }]]
    },
    "Get History": {
      "main": [[{ "node": "Call ChatKit", "type": "main", "index": 0 }]]
    },
    "Call ChatKit": {
      "main": [[{ "node": "Send WhatsApp Message", "type": "main", "index": 0 }]]
    },
    "Send WhatsApp Message": {
      "main": [[{ "node": "Log to Database", "type": "main", "index": 0 }]]
    }
  }
}
```

### Option 2: Direct API Endpoint

```typescript
// File: app/api/whatsapp/webhook/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Verify webhook signature
function verifySignature(payload: string, signature: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', process.env.WHATSAPP_APP_SECRET!)
    .update(payload)
    .digest('hex');
  return signature === `sha256=${expectedSignature}`;
}

// GET - Webhook verification (Meta requirement)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[WhatsApp] Webhook verified');
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// POST - Handle incoming messages
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-hub-signature-256') || '';

    // Verify webhook signature
    if (!verifySignature(rawBody, signature)) {
      console.error('[WhatsApp] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const body = JSON.parse(rawBody);

    // Extract message data
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];

    if (!message) {
      return NextResponse.json({ status: 'no_message' });
    }

    const from = message.from; // Phone number
    const messageText = message.text?.body || '';
    const mediaId = message.image?.id || message.video?.id;

    console.log('[WhatsApp] Message received', { from, text: messageText });

    // Get conversation history
    const { data: history } = await supabase
      .from('chat_logs')
      .select('prompt, response')
      .eq('session_id', `whatsapp-${from}`)
      .order('created_at', { ascending: false })
      .limit(10);

    // Format history for ChatKit
    const formattedHistory = (history || []).reverse().flatMap(h => [
      { role: 'user', content: h.prompt },
      { role: 'assistant', content: h.response }
    ]);

    // Download media if present
    let mediaUrl: string | undefined;
    if (mediaId) {
      mediaUrl = await downloadWhatsAppMedia(mediaId);
    }

    // Call ChatKit agent
    const chatResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL}/api/chatkit/agent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.CHATKIT_API_KEY!
        },
        body: JSON.stringify({
          message: messageText,
          sessionId: `whatsapp-${from}`,
          history: formattedHistory,
          image: mediaUrl
        })
      }
    );

    const { response: aiResponse } = await chatResponse.json();

    // Send response via WhatsApp
    await sendWhatsAppMessage(from, aiResponse);

    // Log conversation
    await supabase.from('chat_logs').insert({
      user_id: `whatsapp:${from}`,
      session_id: `whatsapp-${from}`,
      prompt: messageText,
      response: aiResponse,
      source: 'whatsapp',
      whatsapp_message_id: message.id,
      whatsapp_phone_number: from
    });

    return NextResponse.json({ status: 'success' });

  } catch (error) {
    console.error('[WhatsApp] Error:', error);
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    );
  }
}

// Download media from WhatsApp
async function downloadWhatsAppMedia(mediaId: string): Promise<string> {
  // Step 1: Get media URL
  const urlResponse = await fetch(
    `https://graph.facebook.com/v18.0/${mediaId}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`
      }
    }
  );
  const { url } = await urlResponse.json();

  // Step 2: Download media
  const mediaResponse = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`
    }
  });
  const mediaBlob = await mediaResponse.blob();

  // Step 3: Upload to Supabase Storage
  const fileName = `whatsapp/${Date.now()}-${mediaId}`;
  const { data, error } = await supabase.storage
    .from('chat-media')
    .upload(fileName, mediaBlob);

  if (error) throw error;

  // Return public URL
  const { data: { publicUrl } } = supabase.storage
    .from('chat-media')
    .getPublicUrl(data.path);

  return publicUrl;
}

// Send message via WhatsApp
async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  // Format text for WhatsApp (convert markdown)
  const formattedText = formatForWhatsApp(text);

  // Split if too long (WhatsApp limit: 4096 characters)
  const messages = splitLongMessage(formattedText, 4000);

  for (const message of messages) {
    await fetch(
      `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          text: { body: message }
        })
      }
    );

    // Rate limit: Max 80 messages/second
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

function formatForWhatsApp(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '*$1*')  // Bold: ** → *
    .replace(/__(.*?)__/g, '_$1_')      // Italic: __ → _
    .replace(/~~(.*?)~~/g, '~$1~')      // Strikethrough
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1'); // Remove links (not supported)
}

function splitLongMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];
  
  const messages: string[] = [];
  let currentMessage = '';
  
  text.split('\n').forEach(line => {
    if ((currentMessage + line).length > maxLength) {
      messages.push(currentMessage);
      currentMessage = line + '\n';
    } else {
      currentMessage += line + '\n';
    }
  });
  
  if (currentMessage) messages.push(currentMessage);
  return messages;
}
```

### Dashboard UI Update

```typescript
// File: app/dashboard/sessions/[id]/page.tsx

// Add WhatsApp badge
{session.source === 'whatsapp' && (
  <Badge variant="success" className="flex items-center gap-1">
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
    </svg>
    WhatsApp
  </Badge>
)}

// Display phone number
{session.user_id?.startsWith('whatsapp:') && (
  <div className="text-sm text-muted-foreground">
    {session.user_id.replace('whatsapp:', '')}
  </div>
)}
```

---

## Troubleshooting

### Common Issues

#### 1. Webhook Not Receiving Messages

**Symptoms:**
- Messages sent but no webhook trigger
- Webhook verification fails

**Solutions:**
- Check webhook URL is publicly accessible (HTTPS required)
- Verify `WHATSAPP_VERIFY_TOKEN` matches Meta dashboard
- Check n8n webhook is active
- Review Meta Webhooks dashboard for errors

#### 2. Media Download Failures

**Symptoms:**
- Images/videos not showing
- Download timeout errors

**Solutions:**
- WhatsApp media URLs expire in 5 minutes - download immediately
- Increase timeout for media downloads
- Store in Supabase Storage quickly
- Implement retry logic

#### 3. Rate Limiting

**Symptoms:**
- 429 errors from WhatsApp API
- Messages not delivered

**Solutions:**
- WhatsApp limit: 80 messages/second, 1000/hour
- Implement queue system for high volume
- Add delays between messages (50ms minimum)
- Monitor Meta Business dashboard

#### 4. Message Formatting Issues

**Symptoms:**
- Markdown not rendering
- Links breaking

**Solutions:**
- WhatsApp doesn't support all markdown
- Convert to WhatsApp format: `*bold*`, `_italic_`, `~strikethrough~`
- Remove clickable links (WhatsApp auto-detects plain URLs)
- Test formatting with test number first

---

## Next Steps

### Immediate Actions

1. **Review feasibility** with team
2. **Set up WhatsApp Business account** (can take 1-2 weeks for approval)
3. **Create test environment** for development
4. **Choose implementation option** (n8n vs direct API)

### Resources Needed

- WhatsApp Business API access (Meta Business verification)
- Development time (1-2 weeks)
- Testing phone numbers (business line)
- Budget allocation ($50-200/month for messages)

### Success Metrics

Track these KPIs after launch:

- **Response rate:** % of WhatsApp messages answered vs web chat
- **Conversion rate:** Trade-ins completed via WhatsApp
- **Engagement time:** Average conversation duration
- **Customer satisfaction:** CSAT scores
- **Cost per conversation:** Total cost / conversations

---

## References

- [WhatsApp Business API Documentation](https://developers.facebook.com/docs/whatsapp)
- [n8n WhatsApp Nodes](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.whatsapp/)
- [Meta Business Platform](https://business.facebook.com/)
- [Current System Documentation](./CLAUDE.md)
- [ChatKit Security](./SECURITY.md)

---

**Document Version:** 1.0  
**Created:** 2025-01-27  
**Next Review:** Before implementation kickoff
