# TradeZone Widget - Client Requirements

## Client Request Summary

The client wants a chat widget with the following features:

### ✅ Core Features
1. **Opens in center of screen** on first visit
2. **Draggable** - Can be moved anywhere on screen
3. **Closeable** - Can be closed and reopened
4. **Session Persistent** - Remembers state across page navigation:
   - Position (x, y coordinates)
   - Open/closed state
   - **Chat history** (all messages)
   - Mode (text/voice)
5. **Clears on browser close** - New session = fresh start

### 🎨 Design Requirements
- Dark theme (#1a1a2e background)
- Purple gradient (#8b5cf6 → #6d28d9)
- Video avatar: `https://videostream44.b-cdn.net/tradezone-welcome-avatar-2.mp4`
- Matches dashboard design

### 🔧 Technical Requirements
- Uses `sessionStorage` (not localStorage)
- Persists across page navigation
- Doesn't lose chat history when clicking links
- Mobile responsive
- CORS enabled

## Implementation Plan

### File: `tradezone-persistent.js`

**Key Features:**
```javascript
// Session storage structure
{
  sessionId: 'Guest-1234',
  isOpen: true,
  mode: 'text',
  messages: [
    { text: 'Hello', role: 'user', timestamp: 1234567890 },
    { text: 'Hi!', role: 'assistant', timestamp: 1234567891 }
  ],
  position: { x: 100, y: 50 }
}
```

**Persistence:**
- Save on every state change
- Restore on page load
- Clear on browser close (sessionStorage auto-clears)

**Dragging:**
- Desktop only (not mobile)
- Drag from header
- Save position on drag end

**Chat History:**
- Store all messages in sessionStorage
- Restore on page load
- Send last 10 messages as context to API

## Usage

```html
<script src="https://trade.rezult.co/widget/tradezone-persistent.js"></script>
<script>
  TradeZonePersistent.init({
    apiUrl: 'https://trade.rezult.co',
    videoUrl: 'https://videostream44.b-cdn.net/tradezone-welcome-avatar-2.mp4',
    autoOpen: true,
    enableVoice: true
  });
</script>
```

## Status

⏳ **In Progress** - Creating full implementation
✅ **CORS Fixed** - Voice chat now works cross-domain
✅ **Mobile Optimized** - Full-screen on mobile
✅ **Dark Theme** - Purple branding applied

## Next Steps

1. Complete `tradezone-persistent.js` implementation
2. Test session persistence across pages
3. Test dragging functionality
4. Test chat history restoration
5. Deploy to production
6. Add to tradezone.sg

## Files

- `/public/widget/tradezone-persistent.js` - Main widget (in progress)
- `/public/widget/chat-widget-enhanced.js` - Current enhanced version
- `/public/widget/demo-all.html` - Demo page
- `/app/api/chatkit/agent/route.ts` - Text chat API (CORS enabled)
- `/app/api/chatkit/realtime/route.ts` - Voice chat API (CORS enabled)
