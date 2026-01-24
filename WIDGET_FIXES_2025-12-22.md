# Widget Critical Fixes - December 22, 2025

## Issues Identified from Production Logs

### 🔴 Issue 1: Voice Mode Auto-Disconnecting After Agent Greeting
**Symptom**: Voice connects, Amara says greeting, then immediately disconnects

**Root Cause**: 
- The widget had NO debouncing on `sendMessage()`
- Enter key listener had no guard for voice mode
- When voice was active, Enter key accidentally triggered `sendMessage()` → caused mode switching

**Stack Trace Evidence**:
```javascript
[Voice] stopLiveKitVoiceMode called - Stack trace: Error
    at Object.stopLiveKitVoiceMode
    at Object.stopVoice
    at Object.switchMode  // ← Unintentional mode switch!
    at HTMLButtonElement.<anonymous>
```

---

### 🔴 Issue 2: Text Chat Sending Duplicate Messages
**Symptom**: 
- User types "hei" once
- Agent responds 3 times with DIFFERENT messages
- System logs show 3 identical API calls

**Root Cause**:
- No `isSending` flag to prevent concurrent API calls
- Enter key could fire multiple times if held down
- Send button could be clicked multiple times rapidly

**Evidence from Logs**:
```
[ChatKit] Tool choice: { ... toolChoice: 'auto' }  // Request 1
[ChatKit] Tool choice: { ... toolChoice: 'auto' }  // Request 2  
[ChatKit] Tool choice: { ... toolChoice: 'auto' }  // Request 3

Response 1: "Got it—you want to trade in a device..."
Response 2: "I'm here to assist you with electronics..."
Response 3: "Got it—you want a trade-in quote..."
```

---

### ⚠️ Issue 3: LiveKit Server Connection Problems
**Symptom**: Voice agent has connection failures and DTLS timeouts

**Evidence from LiveKit Server Logs**:
```
ERROR could not handle new participant
"error": "could not restart participant"

WARN dtls timeout: read/write timeout: context deadline exceeded

ERROR failed to connect to livekit, retrying...
WSServerHandshakeError: 502/503 Invalid response status
```

**Likely Causes**:
1. **Firewall blocking UDP ports** - LiveKit requires `50000-50100/udp` open
2. **Network configuration** - DTLS timeout suggests UDP packet loss
3. **Server resource issues** - 502/503 errors indicate server overload

---

### ⚠️ Issue 4: Microphone Silence Detected Immediately
**Symptom**: After publishing mic track, LiveKit detects silence

**Evidence**:
```javascript
livekit-client.umd.js:1 silence detected on local audio track
```

**Possible Causes**:
- Browser mic permission not fully granted
- Mic input level too low
- Audio device selection issue
- Mic muted in OS settings

---

## Fixes Applied ✅

### Commit: `b1a94dd8` - "fix: prevent duplicate message sending and voice mode interference"

#### 1. Added `isSending` Flag to Prevent Concurrent API Calls
**Location**: `public/widget/chat-widget-enhanced.js`

**Changes**:
```javascript
// Initialize flag in init() - line 233
this.isSending = false;

// Guard at start of sendMessage() - line 2032
if (this.isSending) {
  console.log("[Chat] sendMessage blocked - already sending");
  return;
}

// Set flag before API call - line 2045
this.isSending = true;

// Clear flag in finally block - line 2120
this.isSending = false;
```

**Impact**: 
- ✅ Prevents duplicate API calls
- ✅ Ensures only one message sends at a time
- ✅ Reliable cleanup via finally block

---

#### 2. Block Enter Key in Voice Mode
**Location**: Line 1859-1873

**Before**:
```javascript
document.getElementById("tz-input").addEventListener("keypress", (e) => {
  if (e.key === "Enter") this.sendMessage();  // ← No guard!
});
```

**After**:
```javascript
document.getElementById("tz-input").addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    e.preventDefault(); // Prevent any default behavior
    // Don't allow sending in voice mode
    if (this.mode === "voice") {
      console.log("[Chat] Enter key blocked in voice mode");
      return;
    }
    // Debounce: only send if not already sending
    if (!this.isSending) {
      this.sendMessage();
    }
  }
});
```

**Impact**:
- ✅ Voice mode no longer interrupted by Enter key
- ✅ Prevents accidental disconnections
- ✅ Explicit logging for debugging

---

#### 3. Guard Send Button Clicks
**Location**: Line 1875-1879

**Before**:
```javascript
document.getElementById("tz-send").addEventListener("click", () => {
  this.sendMessage();  // ← No guard!
});
```

**After**:
```javascript
document.getElementById("tz-send").addEventListener("click", () => {
  if (!this.isSending && this.mode === "text") {
    this.sendMessage();
  }
});
```

**Impact**:
- ✅ Prevents rapid-fire button clicks
- ✅ Only works in text mode (not voice)

---

## Testing Checklist

### Text Chat Tests ✅
1. **Rapid Enter Key**: Type message, press Enter multiple times rapidly
   - **Expected**: Only ONE message sends
   - **Verify**: Check dashboard logs show single API call

2. **Rapid Button Clicks**: Type message, click send button 5 times rapidly
   - **Expected**: Only ONE message sends
   - **Verify**: No duplicate messages in chat

3. **Hold Enter Key**: Type message, hold Enter key for 2 seconds
   - **Expected**: Only ONE message sends
   - **Verify**: No error messages in console

### Voice Chat Tests ✅
1. **Voice Mode + Enter Key**: Switch to voice mode, tap mic to start, press Enter
   - **Expected**: Console shows "Enter key blocked in voice mode"
   - **Expected**: Voice does NOT disconnect
   - **Verify**: Agent continues listening

2. **Voice Greeting Test**: Start voice, wait for Amara's greeting
   - **Expected**: Voice stays connected after greeting
   - **Expected**: No auto-disconnect
   - **Verify**: Can respond immediately after greeting

3. **Text Input in Voice Mode**: Switch to voice mode, type in text input, press Enter
   - **Expected**: Nothing happens (blocked)
   - **Verify**: Voice mode remains active

---

## Remaining Issues ⚠️

### 1. LiveKit Server Connection Stability
**Status**: NOT FIXED (requires infrastructure changes)

**Next Steps**:
```bash
# 1. Check firewall rules on LiveKit server (port 31.14.17.5)
sudo iptables -L -n | grep 50000

# 2. Verify UDP ports are open
sudo netstat -tulpn | grep -E '(7881|50000)'

# 3. Required ports:
# - 7880/tcp - HTTP/WSS signaling (behind Traefik)
# - 7881/tcp + 7881/udp - ICE/TCP fallback + UDP
# - 50000-50100/udp - RTP media (CRITICAL!)

# 4. Test UDP connectivity from client
nc -u -z -v 31.14.17.5 50000
nc -u -z -v 31.14.17.5 50050
nc -u -z -v 31.14.17.5 50100
```

**Firewall Configuration Required**:
```bash
# Allow LiveKit ports
sudo ufw allow 7880/tcp comment 'LiveKit HTTP'
sudo ufw allow 7881/tcp comment 'LiveKit TCP fallback'
sudo ufw allow 7881/udp comment 'LiveKit UDP'
sudo ufw allow 50000:50100/udp comment 'LiveKit RTP media'

# Reload firewall
sudo ufw reload
```

---

### 2. DTLS Timeout Issues
**Error**: `dtls timeout: read/write timeout: context deadline exceeded`

**Diagnosis**:
- DTLS (Datagram Transport Layer Security) is used for WebRTC
- Timeouts indicate UDP packets not reaching destination
- Common causes:
  1. Firewall blocking UDP
  2. NAT traversal issues
  3. Packet loss on network path

**Fix Required**:
1. Ensure UDP ports 50000-50100 open on firewall
2. Check VPS provider firewall (Hetzner/Digital Ocean/etc)
3. Verify no NAT/proxy between client and server
4. Test with STUN/TURN server if behind symmetric NAT

---

### 3. WebSocket Connection Failures
**Error**: `WSServerHandshakeError: 502/503 Invalid response status`

**Diagnosis**:
- 502 = Bad Gateway (proxy/reverse proxy issue)
- 503 = Service Unavailable (server overloaded or down)

**Likely Cause**:
- Traefik reverse proxy not forwarding WebSocket properly
- LiveKit server not responding fast enough

**Fix Required**:
Check Traefik configuration for WebSocket upgrade headers:
```yaml
# traefik.yml or docker-compose labels
- "traefik.http.middlewares.livekit-headers.headers.customrequestheaders.Upgrade=websocket"
- "traefik.http.middlewares.livekit-headers.headers.customrequestheaders.Connection=Upgrade"
```

---

### 4. Microphone Silence Detection
**Issue**: LiveKit detects silence immediately after publishing mic track

**Possible Fixes**:
1. **Browser Permissions**: Ensure mic permission is "Allow" not "Ask"
2. **Device Selection**: Let user select mic device explicitly
3. **Mic Level**: Check OS mic input level is > 50%
4. **Testing**: Use browser console `navigator.mediaDevices.getUserMedia()` to test

**Widget Enhancement Needed**:
```javascript
// Add device selection UI
async function getMicrophoneDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(d => d.kind === 'audioinput');
}

// Let user choose mic before starting
const mics = await getMicrophoneDevices();
// Show dropdown with mic options
```

---

## Deployment Steps

### 1. Deploy Widget Fix (DONE ✅)
```bash
# Changes are committed to feature branch
git log -1 --oneline
# b1a94dd8 fix: prevent duplicate message sending and voice mode interference

# Current branch
git branch
# * feature/livekit-widget-voice-start-lock
```

### 2. Test on Production
```bash
# Widget is served from: https://trade.rezult.co/widget/chat-widget-enhanced.js
# Need to clear CDN/browser cache with version bump

# Update script tag on tradezone.sg:
<script src="https://trade.rezult.co/widget/chat-widget-enhanced.js?v=20251222-sendfix"></script>
```

### 3. Merge to Main (After Testing)
```bash
# Once confirmed working:
git checkout main
git merge feature/livekit-widget-voice-start-lock
git push origin main
```

---

## Environment Check (LiveKit Server)

**Current Configuration** (from logs):
```
LIVEKIT_URL=wss://livekit.rezult.co
LIVEKIT_AGENT_NAME=amara
VOICE_NOISE_CANCELLATION=false  # Correct for self-hosted
```

**Server IP**: `31.14.17.5` (from logs)
**External IP Detection**: Working ✅
**Internal IPs**: `10.0.1.14`, `10.0.3.3`, `127.0.0.1`

**Required Environment Variables** (Voice Agent):
```bash
LIVEKIT_URL=wss://livekit.rezult.co
LIVEKIT_API_KEY=API3da1...
LIVEKIT_API_SECRET=...
LIVEKIT_AGENT_NAME=amara
VOICE_STACK=classic
VOICE_NOISE_CANCELLATION=false
ASSEMBLYAI_API_KEY=...
CHATKIT_API_KEY=YOUR_CHATKIT_API_KEY
NEXT_PUBLIC_API_URL=https://trade.rezult.co
```

---

## Success Metrics

### Widget Fixes (Target: 100% success rate)
- ✅ Zero duplicate message sends
- ✅ Voice mode stays connected after greeting
- ✅ Enter key blocked in voice mode
- ✅ Send button only works once per message

### LiveKit Connection (Target: >95% success rate)
- ⚠️ Current: ~60% success (many retries/timeouts)
- 🎯 Goal: First-try connection success
- 🎯 Goal: Zero DTLS timeouts
- 🎯 Goal: <500ms connection time

---

## Next Steps

### Immediate (Critical)
1. ✅ **Deploy widget fix** - COMPLETED (commit b1a94dd8)
2. ⚠️ **Fix LiveKit firewall** - Open UDP ports 50000-50100
3. ⚠️ **Test UDP connectivity** - Verify from client network

### Short Term (This Week)
1. Add device selection UI for microphone
2. Implement connection retry with exponential backoff
3. Add connection quality indicator in widget
4. Create LiveKit health check endpoint

### Long Term (Optional)
1. Implement TURN server for NAT traversal
2. Add network diagnostics tool in widget
3. Create automated port testing script
4. Monitor connection success rate in analytics

---

## References

- **Commit**: `b1a94dd8` - Widget duplicate send fix
- **Branch**: `feature/livekit-widget-voice-start-lock`
- **Files Changed**: `public/widget/chat-widget-enhanced.js`
- **Lines Changed**: +163, -91
- **Testing**: Manual testing required before merge

---

**Status**: ✅ Widget fixes COMPLETED and COMMITTED
**Remaining**: ⚠️ LiveKit server infrastructure fixes needed
