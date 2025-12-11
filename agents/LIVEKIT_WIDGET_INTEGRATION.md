# LiveKit Widget Integration Plan

## Goal
Replace OpenAI Realtime with LiveKit in the existing ChatKit widget while keeping ALL visual features.

## Current Widget Status ✅
- ✅ Product cards with images, prices, links
- ✅ Trade-in forms
- ✅ Beautiful UI (desktop centered, mobile corner)
- ✅ Voice button
- ✅ Text chat
- ❌ Uses OpenAI Realtime (to be replaced)

## What Changes

### Replace This (OpenAI Realtime):
```javascript
voiceState: {
  ws: null, // WebSocket to OpenAI
  audioContext: null,
  // OpenAI-specific code
}
```

### With This (LiveKit):
```javascript
voiceState: {
  room: null, // LiveKit Room
  audioTrack: null,
  // LiveKit-specific code
}
```

## What Stays EXACTLY the Same ✅

1. **Visual UI** - No changes to HTML/CSS
2. **Product Cards** - Same display logic
3. **Trade-in Forms** - Same forms
4. **Text Chat** - Works exactly as before
5. **Message Display** - Same rendering
6. **All Business Logic** - Same API calls

## Integration Steps

### Step 1: Add LiveKit Client Library
```html
<script src="https://unpkg.com/livekit-client@2.5.7/dist/livekit-client.umd.js"></script>
```

### Step 2: Replace Voice Connection Logic

**Old (OpenAI)**:
```javascript
async startVoice() {
  const ws = new WebSocket('wss://api.openai.com/v1/realtime');
  // Connect to OpenAI
}
```

**New (LiveKit)**:
```javascript
async startVoice() {
  // Get LiveKit token
  const response = await fetch(`${this.config.apiUrl}/api/livekit/token`, {
    method: 'POST',
    body: JSON.stringify({ roomName, participantName })
  });
  const { token, url } = await response.json();
  
  // Connect to LiveKit
  const room = new LiveKitClient.Room();
  await room.connect(url, token);
  
  // Publish microphone
  const audioTrack = await LiveKitClient.createLocalAudioTrack();
  await room.localParticipant.publishTrack(audioTrack);
}
```

### Step 3: Keep Message Rendering Unchanged

When agent responds, the widget already knows how to:
- Display product cards
- Show trade-in forms
- Render links
- Format text

**No changes needed** - just ensure LiveKit agent sends the same message format.

## Backend Changes Needed

### Python Agent Sends Structured Messages

The agent should return tool results in a format the widget expects:

```python
# When searchProducts is called
@function_tool
async def searchProducts(context: RunContext, query: str) -> str:
    # Call API
    products = await api.search(query)
    
    # For LLM (voice response)
    voice_response = f"I found {len(products)} products. Check your screen."
    
    # For UI (structured data) - send via data channel or return in special format
    # Widget will parse and display as cards
    
    return voice_response
```

## Testing Plan

1. **Keep text chat working** - Don't touch it
2. **Add LiveKit voice** - Parallel to existing
3. **Test product search** - Cards should display
4. **Test trade-in** - Forms should display
5. **Compare to current** - Should look identical

## Rollback Plan

If anything breaks:
1. Git branch: `feature/livekit-voice-agent`
2. Main branch still has working OpenAI Realtime
3. Can merge or discard LiveKit branch

## Success Criteria ✅

- ✅ Voice button connects to LiveKit instead of OpenAI
- ✅ Product cards display exactly the same
- ✅ Trade-in forms work exactly the same
- ✅ Text chat untouched and working
- ✅ All visual elements identical
- ✅ Better latency (450ms vs 1500ms)
- ✅ Lower cost (50% reduction)

## Next Steps

1. Create backup of `chat-widget-enhanced.js`
2. Add LiveKit client library
3. Replace voice connection code only
4. Test end-to-end
5. Deploy when confirmed working

---

**Status**: Ready to implement
**Risk**: Low (can rollback easily)
**Estimated Time**: 2-3 hours
