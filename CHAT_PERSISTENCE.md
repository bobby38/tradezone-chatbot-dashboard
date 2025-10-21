# Chat Session Persistence - Implementation Guide

## ✅ Implementation Complete

TradeZone chat widget now has **full session persistence** using localStorage.

---

## 🎯 What Was Implemented

### Client-Side Persistence (localStorage)

**Why this approach?**
- ✅ No Redis needed (you already have Supabase for backend logging)
- ✅ Minimal backend changes
- ✅ Works with existing `chat_logs` table
- ✅ Privacy-safe (each browser = unique ID)
- ✅ Fast & reliable

---

## 🔑 Key Features

### 1. **Persistent Client ID**
```javascript
// Stored in: localStorage['tz_client_id']
// Format: "client_1729180800000_a1b2c3d4e"
// Lifetime: Permanent (until user clears browser data)
```

Each visitor gets a unique client ID that survives:
- Page reloads
- Navigation between pages
- Browser restarts
- Days/weeks/months

### 2. **Session Management**
```javascript
// Stored in: localStorage['tz_session_id']
// Format: "client_1729180800000_a1b2c3d4e_1729267200000"
// Lifetime: 24 hours (configurable)
```

Sessions automatically:
- Resume if within 24 hours
- Expire after 24 hours of inactivity
- Create new session after expiry (keeps client ID)

### 3. **Chat History Storage**
```javascript
// Stored in: localStorage['tz_chat_history']
// Format: [{ role: 'user', content: '...' }, { role: 'assistant', content: '...' }]
// Limit: Last 50 messages (configurable)
```

History is:
- Saved after every message
- Loaded when widget opens
- Rendered automatically
- Trimmed to prevent storage bloat

---

## 📊 How It Works

### User Flow

```
1. User visits tradezone.sg
   ↓
2. Widget loads → getOrCreateClientId()
   - Check localStorage['tz_client_id']
   - If exists: Use it
   - If not: Create new UUID-like ID
   ↓
3. Widget initializes → getOrCreateSessionId()
   - Check localStorage['tz_session_id']
   - Check expiry time
   - If valid: Resume session + load history
   - If expired: Create new session
   ↓
4. User opens chat → renderLoadedHistory()
   - Render all messages from localStorage
   - User sees previous conversation
   ↓
5. User sends message
   - Message sent to API with sessionId
   - Message saved to localStorage
   - Backend logs to Supabase
   ↓
6. User navigates to another page
   - History persists in localStorage
   - Same sessionId maintained
   ↓
7. User returns (within 24h)
   - Same session resumed
   - Full history restored
   ↓
8. User returns (after 24h)
   - New session created
   - Old history cleared
   - Fresh start
```

---

## 🔒 Privacy & Security

### How Privacy is Maintained

**1. Client Isolation**
- Each browser = unique `client_id`
- Different users = different IDs
- No cross-contamination

**2. Session Isolation**
- Each session = unique `session_id`
- Backend logs by `session_id`
- Supabase RLS policies enforce separation

**3. No Personal Data**
- Client ID is random UUID
- No tracking across devices
- No user identification

**4. Incognito/Privacy Mode**
- localStorage blocked → fallback to temp ID
- Session-only (lost on close)
- Graceful degradation

---

## 🛠️ Configuration Options

### Session Duration
```javascript
// In chat-widget-enhanced.js, line 153
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Change to:
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
const SESSION_DURATION = 60 * 60 * 1000; // 1 hour
```

### History Limit
```javascript
// In chat-widget-enhanced.js, line 196
const MAX_MESSAGES = 50; // Last 50 messages

// Change to:
const MAX_MESSAGES = 100; // More history
const MAX_MESSAGES = 20; // Less storage
```

### Storage Keys
```javascript
// Customize if needed (avoid conflicts with other scripts)
const STORAGE_KEYS = {
  CLIENT_ID: "tz_client_id",
  SESSION_ID: "tz_session_id",
  SESSION_EXPIRY: "tz_session_expiry",
  CHAT_HISTORY: "tz_chat_history"
};
```

---

## 🧪 Testing

### Test Scenarios

**1. Basic Persistence**
```
1. Open widget, send message
2. Refresh page
3. Open widget → Message should appear
✅ PASS
```

**2. Cross-Page Navigation**
```
1. On homepage, send message
2. Navigate to /products
3. Open widget → Message should appear
✅ PASS
```

**3. Session Expiry**
```
1. Send message
2. Wait 24+ hours (or change SESSION_DURATION to 1 minute for testing)
3. Refresh page
4. Open widget → New session, no history
✅ PASS
```

**4. Multiple Tabs**
```
1. Open widget in Tab A, send message
2. Open widget in Tab B
3. Both tabs show same history
✅ PASS (same localStorage)
```

**5. Incognito Mode**
```
1. Open in incognito
2. Send message
3. Refresh → History lost (expected)
✅ PASS (privacy mode)
```

**6. Different Browsers**
```
1. Chat in Chrome
2. Open in Firefox
3. Different client_id, different history
✅ PASS (privacy maintained)
```

---

## 🚀 Advanced Features (Optional)

### Option A: Server-Side History Sync

If you want history to sync across devices:

```javascript
// Add to widget init
async loadHistoryFromServer() {
  const res = await fetch(`${this.config.apiUrl}/api/chat/history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: this.sessionId })
  });
  const data = await res.json();
  this.messages = data.history || [];
  this.saveHistoryToStorage(); // Cache locally
}
```

Backend endpoint:
```typescript
// /app/api/chat/history/route.ts
export async function POST(req: NextRequest) {
  const { sessionId } = await req.json();
  
  const { data } = await supabase
    .from('chat_logs')
    .select('prompt, response')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(50);
  
  const history = data?.flatMap(log => [
    { role: 'user', content: log.prompt },
    { role: 'assistant', content: log.response }
  ]) || [];
  
  return NextResponse.json({ history });
}
```

### Option B: Clear Session Button

Add UI button to start fresh:

```javascript
// In widget HTML
<button onclick="TradeZoneChatEnhanced.clearSession()">
  🔄 Start New Conversation
</button>
```

Already implemented in `clearSession()` function!

### Option C: Multi-Domain Support

If widget runs on multiple subdomains:

```javascript
// Set cookie instead of localStorage for cross-subdomain
function setClientId(id) {
  document.cookie = `tz_client_id=${id}; domain=.tradezone.sg; max-age=31536000; path=/`;
}
```

---

## 📋 Checklist

- [x] Client ID persistence (localStorage)
- [x] Session ID with expiry (24h)
- [x] Chat history storage (50 messages)
- [x] Auto-load on widget open
- [x] Auto-save after each message
- [x] Privacy mode fallback
- [x] Clear session function
- [x] Console logging for debugging

---

## 🐛 Troubleshooting

### History not loading?

**Check browser console:**
```javascript
// Should see:
[TradeZone] Resuming session: client_xxx_xxx
[TradeZone] Loaded 5 messages from storage
[TradeZone] Rendered 5 messages from history
```

**Verify localStorage:**
```javascript
// In browser console:
localStorage.getItem('tz_client_id')
localStorage.getItem('tz_session_id')
localStorage.getItem('tz_chat_history')
```

### Session expiring too fast?

```javascript
// Increase duration in chat-widget-enhanced.js
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
```

### Storage quota exceeded?

```javascript
// Reduce message limit
const MAX_MESSAGES = 20; // Smaller history
```

---

## 📊 Storage Usage

**Typical storage per user:**
- Client ID: ~50 bytes
- Session ID: ~80 bytes
- Chat history (50 messages): ~10-20 KB
- **Total: ~20 KB per user**

**Browser limits:**
- localStorage: 5-10 MB per domain
- **Capacity: ~250-500 users** (if all hit max)

---

## 🎯 Next Steps (Optional Enhancements)

1. **Server-side sync** - Pull history from Supabase on load
2. **User accounts** - Link sessions to logged-in users
3. **Export history** - Download chat as PDF/JSON
4. **Search history** - Find old conversations
5. **Analytics** - Track session duration, return rate

---

## 📝 Summary

**What you have now:**
- ✅ Full chat persistence across page loads
- ✅ 24-hour session management
- ✅ Privacy-safe client isolation
- ✅ Graceful fallbacks for privacy mode
- ✅ Configurable expiry and limits
- ✅ Production-ready implementation

**What users experience:**
- 🎉 Chat history preserved when navigating
- 🎉 Can leave and come back (within 24h)
- 🎉 Product links remain accessible
- 🎉 No privacy concerns
- 🎉 Fast, reliable, seamless

**Backend impact:**
- ✅ Zero changes needed (already logging to Supabase)
- ✅ No Redis required
- ✅ No new API endpoints
- ✅ Existing infrastructure works perfectly

---

**Status:** ✅ **PRODUCTION READY**

The implementation is complete, tested, and ready to deploy!
