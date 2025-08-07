# n8n Chat Session Integration Guide

## Overview

This guide explains how to integrate n8n with your TradeZone Chatbot Dashboard to properly track and manage chat sessions instead of having "unknown" session IDs.

## 🚀 Quick Setup

### 1. Run Database Migration

First, run the enhanced chat sessions schema in your Supabase SQL Editor:

```sql
-- Copy and paste the contents of enhance-chat-sessions.sql
-- This will create the session management tables and triggers
```

### 2. Update n8n Webhook URL

Change your n8n webhook URL from the old endpoint to:

```
https://your-domain.com/api/n8n-chat
```

### 3. n8n Webhook Configuration

Configure your n8n HTTP Request node with these settings:

**Method:** `POST`
**URL:** `https://your-domain.com/api/n8n-chat`
**Headers:**
```json
{
  "Content-Type": "application/json"
}
```

**Body (JSON):**
```json
{
  "user_id": "{{ $json.user_id }}",
  "prompt": "{{ $json.user_message }}",
  "response": "{{ $json.ai_response }}",
  "session_id": "{{ $json.session_id }}", // Optional - will auto-create if not provided
  "status": "success", // or "error" if AI call failed
  "processing_time": {{ $json.processing_time }}, // Optional - in milliseconds
  "metadata": {
    "model": "{{ $json.model_used }}",
    "tokens": {{ $json.tokens_used }}
  }
}
```

## 📊 Session Management Features

### Automatic Session Creation
- If no `session_id` is provided, the system automatically creates sessions
- Sessions are grouped by user and time proximity (30-minute gaps = new session)
- Session names are auto-generated from the first message

### Session Tracking
- **Session ID**: Unique identifier for each conversation
- **User ID**: Identifier for the user (can be email, username, or custom ID)
- **Turn Index**: Message order within the session (1, 2, 3...)
- **Processing Time**: How long the AI took to respond
- **Source**: Automatically tagged as "n8n"
- **Status**: Track success/error rates per session

## 🔧 API Endpoints

### 1. Simple Chat Logging (Recommended)
**POST** `/api/n8n-chat`

Automatically handles session management. Just send the chat data:

```json
{
  "user_id": "user123@example.com",
  "prompt": "What is the weather today?",
  "response": "I can help you check the weather...",
  "status": "success",
  "processing_time": 1250
}
```

**Response:**
```json
{
  "success": true,
  "session_id": "uuid-here",
  "turn_index": 1,
  "auto_session": true
}
```

### 2. Advanced Session Management
**POST** `/api/chat-sessions`

For more control over session creation:

```json
{
  "action": "create_session",
  "user_id": "user123@example.com",
  "session_name": "Weather Discussion"
}
```

### 3. Health Check
**GET** `/api/n8n-chat`

Check if the endpoint is working and get stats.

## 📈 Dashboard Features

### New Sessions Page
- View all chat sessions grouped by user
- See session duration, message count, success rates
- Filter and search sessions
- Navigate to detailed session views

### Session Details
- Complete conversation history
- Turn-by-turn message flow
- Processing times and error tracking
- Session metadata and statistics

### Enhanced Analytics
- Session-based analytics instead of individual messages
- User engagement metrics
- Session duration analysis
- Success rate tracking per session

## 🛠 n8n Workflow Example

Here's a complete n8n workflow setup:

### 1. Webhook Trigger
- **Method**: POST
- **Path**: `/webhook/chat`

### 2. AI Processing Node
- Your existing OpenAI/AI processing logic

### 3. Session Logger Node (HTTP Request)
- **Method**: POST
- **URL**: `https://your-domain.com/api/n8n-chat`
- **Body**:
```json
{
  "user_id": "{{ $json.user_id || $json.email || 'anonymous' }}",
  "prompt": "{{ $json.message || $json.prompt }}",
  "response": "{{ $json.ai_response }}",
  "status": "{{ $json.error ? 'error' : 'success' }}",
  "processing_time": "{{ $json.processing_time }}",
  "metadata": {
    "model": "{{ $json.model }}",
    "temperature": {{ $json.temperature }},
    "tokens": {{ $json.tokens }}
  }
}
```

## 🔍 Session Grouping Logic

### Automatic Session Detection
1. **New User**: Creates first session automatically
2. **Returning User**: 
   - If last activity < 30 minutes ago → Continue existing session
   - If last activity > 30 minutes ago → Create new session
3. **Manual Session**: Provide `session_id` to force specific session

### Session Naming
- Auto-generated from first message (truncated to 50 chars)
- Can be manually set via `session_name` parameter
- Format: "What is the weather..." or "Trading Discussion"

## 📊 Benefits

### Before (Individual Messages)
- ❌ Messages scattered with "unknown" sessions
- ❌ No conversation context
- ❌ Difficult to track user journeys
- ❌ Poor analytics and insights

### After (Session-Based)
- ✅ Conversations properly grouped
- ✅ Clear user interaction patterns  
- ✅ Session duration and engagement metrics
- ✅ Better analytics and reporting
- ✅ Easy conversation history review

## 🚨 Migration Notes

### Existing Data
The migration script automatically:
- Groups existing chat logs into sessions based on user_id and timestamp proximity
- Assigns session IDs to orphaned messages
- Creates session records for historical data
- Preserves all existing message data

### Backward Compatibility
- Old endpoints still work
- Existing n8n workflows continue functioning
- Gradual migration possible

## 🔧 Troubleshooting

### Common Issues

1. **"Session not found" errors**
   - Check that the database migration ran successfully
   - Verify session_id format (should be UUID)

2. **Messages not grouping properly**
   - Ensure consistent user_id format
   - Check time gaps between messages (30min threshold)

3. **n8n webhook failures**
   - Verify endpoint URL is correct
   - Check request body format matches expected schema
   - Review server logs for detailed error messages

### Debug Endpoints

**GET** `/api/n8n-chat?user_id=USER_ID`
- Get recent sessions for a specific user

**GET** `/api/n8n-chat?session_id=SESSION_ID`  
- Get specific session information

## 📝 Next Steps

1. **Run the database migration** (`enhance-chat-sessions.sql`)
2. **Update n8n webhook URL** to `/api/n8n-chat`
3. **Test with a few messages** to verify session creation
4. **Review sessions in dashboard** at `/dashboard/sessions`
5. **Monitor session analytics** for insights

Your chat logs will now be properly organized by user sessions instead of showing "unknown" sessions! 🎉
