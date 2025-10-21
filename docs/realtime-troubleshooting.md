# GPT Realtime Mini - Troubleshooting & Debugging Guide

## Quick Diagnostics

### Check Environment Variables

Run this command to verify your configuration:

```bash
# Check if required variables are set
echo "OPENAI_API_KEY: ${OPENAI_API_KEY:0:10}..."
echo "OPENAI_VECTOR_STORE_ID: $OPENAI_VECTOR_STORE_ID"
echo "OPENAI_REALTIME_MODEL: ${OPENAI_REALTIME_MODEL:-gpt-4o-mini-realtime-preview-2024-12-17}"
```

### Browser Console Checks

Open browser DevTools (F12) and look for these log patterns:

```
✅ Success Pattern:
[Realtime] Connected
[Realtime] Session configured with vector store: vs_xxxxx
[Realtime Event]: session.updated
[Realtime Event]: conversation.item.input_audio_transcription.completed
[User]: [your speech transcription]
[Realtime Event]: response.audio.delta
[Audio Chunk]: 8192 bytes

❌ Error Pattern:
[Realtime] Error: WebSocket connection failed
[Realtime Error]: { error: { message: "..." } }
[Audio Playback Error]: ...
```

## Common Issues & Solutions

### 1. WebSocket Connection Fails

#### Symptom
```
Status: "Connection error"
Console: WebSocket connection to 'wss://api.openai.com/v1/realtime' failed
OR
[Realtime Error]: Missing required parameter: 'session.type'
```

#### Root Causes & Fixes

**A. Missing session.type Parameter**
```javascript
// Error: Missing required parameter: 'session.type'
// Fix: Ensure session.update includes type field

ws.send(JSON.stringify({
  type: "session.update",
  session: {
    type: "response",  // ← REQUIRED
    modalities: ["text", "audio"],
    voice: "alloy",
    // ... rest of config
  }
}));
```

**B. Invalid API Key**
```bash
# Verify API key format
echo $OPENAI_API_KEY
# Should start with: sk-proj-

# Test API key with curl
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

**B. Missing Realtime API Access**
- Realtime API requires specific access tier
- Check [OpenAI Platform](https://platform.openai.com/settings/organization/billing) billing status
- Ensure you're on a paid plan with Realtime API enabled

**C. CORS/Network Issues**
```javascript
// Check browser network tab for:
// - 401 Unauthorized: Bad API key
// - 403 Forbidden: No Realtime access
// - 429 Too Many Requests: Rate limited
// - 500 Server Error: OpenAI service issue
```

**D. Invalid Vector Store ID**
```bash
# Verify vector store exists
curl https://api.openai.com/v1/vector_stores/$OPENAI_VECTOR_STORE_ID \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

### 2. No Audio Playback (Silent AI)

#### Symptom
```
- User speech is transcribed ✅
- AI response appears in transcript ✅
- No audio plays ❌
Console: [Audio Chunk]: 8192 bytes (but no sound)
```

#### Root Causes & Fixes

**A. Audio Context Not Initialized**
```javascript
// Check in browser console:
if (!window.AudioContext && !window.webkitAudioContext) {
  console.error("Web Audio API not supported");
}

// Force audio context resume (some browsers require user interaction)
document.addEventListener('click', () => {
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
});
```

**B. Audio Output Device Issues**
- Check system audio is not muted
- Verify correct output device selected
- Test with: `new Audio('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3').play()`

**C. PCM16 Decoding Error**
```javascript
// The fix is already implemented, but verify:
// 1. Base64 decode works
// 2. Uint8Array to Int16Array conversion
// 3. Int16 to Float32 normalization (-1.0 to 1.0)

// Debug in playAudioChunk:
console.log('PCM16 length:', pcm16.length);
console.log('PCM16 sample:', pcm16[0], pcm16[100]);
console.log('Float32 sample:', float32[0], float32[100]);
```

**D. Audio Queue Not Processing**
```javascript
// Add debug logs in processAudioQueue:
console.log('Queue length:', audioQueueRef.current.length);
console.log('Is playing:', isPlayingRef.current);

// If queue builds up but doesn't play:
// - Check for async/await errors
// - Verify source.onended callback fires
// - Ensure no exceptions in try/catch
```

### 3. Microphone Not Working

#### Symptom
```
Alert: "Please allow microphone access to use voice chat"
OR
Status stuck on: "Initializing..."
```

#### Root Causes & Fixes

**A. Permissions Denied**
```javascript
// Check permissions
navigator.permissions.query({ name: 'microphone' })
  .then(result => console.log('Microphone permission:', result.state));

// Browser-specific:
// Chrome: chrome://settings/content/microphone
// Firefox: about:preferences#privacy
// Safari: Safari > Settings > Websites > Microphone
```

**B. HTTPS Required**
- `getUserMedia` requires secure context
- Use `https://` or `localhost` (http allowed for localhost only)
- Check: `window.isSecureContext` should be `true`

**C. No Microphone Device**
```javascript
// List available devices
navigator.mediaDevices.enumerateDevices()
  .then(devices => {
    const mics = devices.filter(d => d.kind === 'audioinput');
    console.log('Microphones:', mics);
  });
```

**D. Browser Compatibility**
```javascript
// Check support
if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
  console.error('getUserMedia not supported');
  // Fallback or show error message
}
```

### 4. Tool Calls Not Executing

#### Symptom
```
Console: [Tool Called]: searchtool { query: "PS5" }
But no search results appear
```

#### Root Causes & Fixes

**A. Perplexity API Key Missing**
```bash
# For searchtool
echo $PERPLEXITY_API_KEY
# Should start with: pplx-

# Test Perplexity API
curl https://api.perplexity.ai/chat/completions \
  -H "Authorization: Bearer $PERPLEXITY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"llama-3.1-sonar-small-128k-online","messages":[{"role":"user","content":"test"}]}'
```

**B. Tool Endpoint Errors**
```javascript
// Check network tab for:
// POST /api/tools/perplexity - Should return 200
// POST /api/tools/email - Should return 200

// Debug in handleToolCall:
console.log('Calling tool:', name, parsedArgs);
const response = await fetch('/api/tools/perplexity', {...});
console.log('Tool response:', await response.json());
```

**C. Function Result Not Sent Back**
```javascript
// Verify this sequence in handleToolCall:
// 1. Call tool API ✅
// 2. Get result ✅
// 3. Send conversation.item.create with function_call_output ✅
// 4. Send response.create to trigger AI response ✅

// Check WebSocket is still open:
if (wsRef.current?.readyState !== WebSocket.OPEN) {
  console.error('WebSocket closed, cannot send tool result');
}
```

### 5. Transcription Not Appearing

#### Symptom
```
- Audio is being sent (network activity) ✅
- No transcription events received ❌
Console: No "conversation.item.input_audio_transcription.completed" events
```

#### Root Causes & Fixes

**A. Transcription Not Enabled**
```javascript
// Verify session.update includes:
{
  input_audio_transcription: {
    model: "whisper-1"
  }
}
```

**B. Audio Format Issues**
```javascript
// Verify audio capture settings:
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    sampleRate: 24000  // Must be 24000 for Realtime API
  }
});

// Check AudioContext sample rate:
console.log('AudioContext sample rate:', audioContext.sampleRate);
// Should be 24000
```

**C. Silent Audio (No Speech Detected)**
```javascript
// Test microphone is capturing sound:
processor.onaudioprocess = (e) => {
  const inputData = e.inputBuffer.getChannelData(0);
  const rms = Math.sqrt(inputData.reduce((sum, val) => sum + val * val, 0) / inputData.length);
  console.log('Audio level:', rms); // Should be > 0.01 when speaking
};
```

**D. VAD Threshold Too High**
```javascript
// Adjust turn_detection sensitivity in session.update:
turn_detection: {
  type: "server_vad",
  threshold: 0.3,  // Lower = more sensitive (default: 0.5)
  prefix_padding_ms: 300,
  silence_duration_ms: 500  // Lower = faster response
}
```

### 6. High Latency / Slow Responses

#### Symptom
```
Long delay between user speech and AI response (>2 seconds)
```

#### Root Causes & Fixes

**A. Model Selection**
```bash
# Switch to faster model
OPENAI_REALTIME_MODEL=gpt-4o-mini-realtime-preview-2024-12-17

# Or premium model for lowest latency
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview-2024-12-17
```

**B. Network Latency**
```javascript
// Measure WebSocket latency
const start = Date.now();
ws.send(JSON.stringify({ type: 'ping' }));
ws.onmessage = (event) => {
  if (event.data.type === 'pong') {
    console.log('WebSocket latency:', Date.now() - start, 'ms');
  }
};
```

**C. Audio Buffer Size**
```javascript
// Reduce buffer size for lower latency (trade-off: more CPU)
const processor = audioContext.createScriptProcessor(
  2048,  // Smaller = lower latency (default: 4096)
  1, 1
);
```

**D. Tool Execution Time**
```javascript
// Measure tool execution time
const toolStart = Date.now();
const { text } = await handleVectorSearch(query);
console.log('Tool execution time:', Date.now() - toolStart, 'ms');

// Optimize slow tools:
// - Add caching
// - Use faster APIs
// - Reduce response size
```

### 7. Session Disconnects Randomly

#### Symptom
```
Status: "Disconnected" after a few minutes
Console: [Realtime] Disconnected
```

#### Root Causes & Fixes

**A. Idle Timeout**
```javascript
// Send keepalive messages
setInterval(() => {
  if (wsRef.current?.readyState === WebSocket.OPEN) {
    wsRef.current.send(JSON.stringify({
      type: 'input_audio_buffer.commit'
    }));
  }
}, 30000); // Every 30 seconds
```

**B. Network Instability**
```javascript
// Implement reconnection logic
ws.onclose = (event) => {
  console.log('WebSocket closed:', event.code, event.reason);
  if (event.code !== 1000) { // Not normal closure
    setTimeout(() => {
      console.log('Attempting reconnection...');
      startVoiceSession();
    }, 3000);
  }
};
```

**C. Rate Limiting**
```javascript
// Check for rate limit errors
ws.onerror = (error) => {
  console.error('WebSocket error:', error);
  // If 429 Too Many Requests, implement backoff
};
```

## Testing Procedures

### Manual Test Checklist

```bash
# 1. Environment Setup
✓ OPENAI_API_KEY is set and valid
✓ OPENAI_VECTOR_STORE_ID is set and valid
✓ OPENAI_REALTIME_MODEL is set (or using default)
✓ PERPLEXITY_API_KEY is set (for search tool)

# 2. Basic Connection
✓ Navigate to /dashboard/chat
✓ Click "VOICE CHAT"
✓ Click "Start Voice Chat"
✓ Status changes to "Initializing..."
✓ Status changes to "Connected"
✓ Status changes to "Listening..."

# 3. Audio Input
✓ Microphone permission granted
✓ Speak: "Hello Izacc"
✓ Transcript appears: "Hello Izacc"
✓ Status shows: "You: Hello Izacc..."

# 4. Audio Output
✓ AI responds with audio
✓ Status shows: "Izacc speaking..."
✓ Audio plays through speakers
✓ Transcript appears with AI response

# 5. Tool Calling
✓ Say: "Search for PlayStation 5"
✓ Status shows: "Using tool: searchtool..."
✓ Search executes
✓ AI responds with search results
✓ Audio plays with results

# 6. Graceful Shutdown
✓ Click "End Call"
✓ Status changes to "Stopped"
✓ Microphone indicator turns off
✓ WebSocket closes cleanly
```

### Automated Testing Script

```javascript
// Run in browser console on /dashboard/chat page

async function testRealtimeIntegration() {
  console.log('🧪 Starting Realtime Integration Test...\n');
  
  // Test 1: Check environment
  console.log('1️⃣ Checking backend configuration...');
  const configRes = await fetch('/api/chatkit/realtime', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: 'test-session' })
  });
  const config = await configRes.json();
  console.log('Config:', config.success ? '✅' : '❌', config);
  
  // Test 2: Check microphone access
  console.log('\n2️⃣ Checking microphone access...');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log('Microphone: ✅');
    stream.getTracks().forEach(track => track.stop());
  } catch (e) {
    console.log('Microphone: ❌', e.message);
  }
  
  // Test 3: Check Web Audio API
  console.log('\n3️⃣ Checking Web Audio API...');
  try {
    const ctx = new AudioContext({ sampleRate: 24000 });
    console.log('Web Audio API: ✅', 'Sample rate:', ctx.sampleRate);
    ctx.close();
  } catch (e) {
    console.log('Web Audio API: ❌', e.message);
  }
  
  // Test 4: Check tool endpoints
  console.log('\n4️⃣ Checking tool endpoints...');
  try {
    const searchRes = await fetch('/api/tools/perplexity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' })
    });
    console.log('Search tool:', searchRes.ok ? '✅' : '❌', searchRes.status);
  } catch (e) {
    console.log('Search tool: ❌', e.message);
  }
  
  console.log('\n✅ Test complete!');
}

// Run the test
testRealtimeIntegration();
```

## Performance Monitoring

### Key Metrics to Track

```javascript
// Add to realtime-voice.tsx for monitoring

const metrics = {
  connectionTime: 0,
  audioLatency: 0,
  transcriptionDelay: 0,
  toolExecutionTime: 0,
  audioChunksReceived: 0,
  audioChunksPlayed: 0
};

// Measure connection time
const connectStart = Date.now();
ws.onopen = () => {
  metrics.connectionTime = Date.now() - connectStart;
  console.log('📊 Connection time:', metrics.connectionTime, 'ms');
};

// Measure audio latency
let speechEndTime = 0;
// On VAD end event:
speechEndTime = Date.now();
// On first audio chunk:
metrics.audioLatency = Date.now() - speechEndTime;
console.log('📊 Audio latency:', metrics.audioLatency, 'ms');

// Track audio chunks
case 'response.audio.delta':
  metrics.audioChunksReceived++;
  playAudioChunk(event.delta);
  break;

// In processAudioQueue:
metrics.audioChunksPlayed++;
console.log('📊 Queue size:', audioQueueRef.current.length);
```

### Performance Targets

| Metric | Target | Acceptable | Poor |
|--------|--------|------------|------|
| Connection Time | <1s | <3s | >5s |
| Audio Latency | <300ms | <800ms | >1.5s |
| Transcription Delay | <500ms | <1s | >2s |
| Tool Execution | <1s | <3s | >5s |
| Audio Queue Size | <5 chunks | <15 chunks | >30 chunks |

## Debug Mode

### Enable Verbose Logging

Add to `realtime-voice.tsx`:

```typescript
const DEBUG = process.env.NODE_ENV === 'development';

const log = (...args: any[]) => {
  if (DEBUG) console.log('[Realtime Debug]', ...args);
};

// Use throughout:
log('WebSocket state:', ws.readyState);
log('Audio queue length:', audioQueueRef.current.length);
log('Event received:', event.type, event);
```

### Network Inspection

```javascript
// Monitor all WebSocket messages
const originalSend = WebSocket.prototype.send;
WebSocket.prototype.send = function(data) {
  console.log('📤 WS Send:', JSON.parse(data));
  return originalSend.call(this, data);
};

// Monitor all received messages (already logged in onmessage)
```

## Getting Help

### Information to Provide

When reporting issues, include:

1. **Environment**
   - Browser & version
   - Operating system
   - HTTPS or localhost?

2. **Configuration**
   - Model being used
   - Vector store ID (first 10 chars)
   - API key status (valid/invalid, don't share key)

3. **Console Logs**
   - All `[Realtime]` prefixed logs
   - Any error messages
   - Network tab WebSocket frames

4. **Reproduction Steps**
   - Exact steps to reproduce
   - Expected vs actual behavior
   - Frequency (always/sometimes/rare)

### Support Channels

- GitHub Issues: [Repository Issues](https://github.com/tradezone/dashboard/issues)
- Email: contactus@tradezone.sg
- Documentation: `/docs/gpt-realtime-mini-guide.md`

## Advanced Debugging

### WebSocket Frame Inspection

Chrome DevTools → Network → WS → Frames tab

Look for:
- ✅ Green arrows: Successful messages
- ❌ Red arrows: Errors
- 📊 Message frequency: Should be continuous during speech

### Audio Visualization

Add waveform display:

```typescript
const analyser = audioContext.createAnalyser();
source.connect(analyser);
analyser.fftSize = 2048;
const dataArray = new Uint8Array(analyser.frequencyBinCount);

function draw() {
  analyser.getByteTimeDomainData(dataArray);
  // Render waveform to canvas
  requestAnimationFrame(draw);
}
```

### Memory Leak Detection

```javascript
// Monitor audio queue growth
setInterval(() => {
  if (audioQueueRef.current.length > 50) {
    console.warn('⚠️ Audio queue growing too large:', audioQueueRef.current.length);
    // May indicate playback issues
  }
}, 5000);
```

## Known Limitations

1. **Browser Autoplay Policies**: Some browsers block audio playback until user interaction
2. **Mobile Safari**: May require additional audio context resume logic
3. **Firefox**: Older versions (<88) have limited Web Audio API support
4. **Network**: Requires stable connection, 4G/5G or WiFi recommended
5. **Concurrent Sessions**: One voice session per browser tab

## Changelog

### v1.1.1 (Current)
- ✅ Fixed missing `session.type` parameter (required by OpenAI API)
- ✅ Added `type: "response"` to session configuration

### v1.1.0
- ✅ Implemented audio playback queue
- ✅ Added PCM16 to Float32 conversion
- ✅ Support for gpt-4o-mini-realtime-preview
- ✅ Configurable model via environment variable
- ✅ Enhanced error handling and logging

### v1.0.0 (Initial)
- ✅ WebSocket connection to OpenAI Realtime API
- ✅ Microphone audio capture
- ✅ Speech-to-text transcription
- ✅ Function calling (search, email)
- ✅ Server-side VAD
- ⚠️ Audio playback not implemented (logged only)
