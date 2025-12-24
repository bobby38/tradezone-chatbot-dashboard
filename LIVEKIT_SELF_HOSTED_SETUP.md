# LiveKit Self-Hosted Migration - Setup Guide

## Status: ✅ Almost Ready (1 step remaining)

---

## ✅ Completed Steps

### 1. Python Agent Code Fixed
- ✅ Conditional noise cancellation import
- ✅ Conditional noise cancellation usage
- ✅ Matches documented Dec 21, 2025 fixes in agent.md

### 2. Environment Configuration Updated
- ✅ LIVEKIT_URL changed to `wss://livekit.rezult.co` (self-hosted)
- ✅ VOICE_NOISE_CANCELLATION set to `false`
- ✅ VOICE_STACK set to `classic`
- ✅ LIVEKIT_AGENT_NAME set to `amara`

### 3. Diagnostic Tools Created
- ✅ `scripts/check-livekit-env.py` - Python environment checker
- ✅ `scripts/diagnose-livekit.sh` - Bash network/firewall checker

---

## 🔴 Required Action (BLOCKING)

### Add AssemblyAI API Key

**Why needed:** AssemblyAI provides speech-to-text (STT) for the classic voice stack.

**How to get it:**
1. Go to https://www.assemblyai.com/dashboard
2. Sign up or log in
3. Copy your API key

**How to add it:**

Edit `.env.local` and add this line in the "AI Providers" section:

```bash
ASSEMBLYAI_API_KEY=your_api_key_here
```

**Example location in file:**
```bash
# AI Providers (sign up for free tiers)
DEEPGRAM_API_KEY=114c8aa317d01d2599e897724cfd7038cd29e305
CARTESIA_API_KEY=sk_car_v6FiiYvkuqk4k924QP8BHZ
ASSEMBLYAI_API_KEY=your_key_here  # <-- ADD THIS LINE
```

---

## ⚠️ Potential Issues (To Check)

### 1. LiveKit Server Firewall

**Symptom:** DTLS timeout errors in logs

**Required Ports:**
- `7880/tcp` - HTTP/WSS signaling
- `7881/tcp` - ICE/TCP fallback  
- `7881/udp` - ICE/STUN
- `50000-50100/udp` - RTP media

**How to verify (on LiveKit server):**
```bash
# Check if ports are listening
sudo netstat -ulnp | grep -E '7881|500[0-9]{2}'

# Open firewall if needed
sudo ufw allow 7881/tcp
sudo ufw allow 7881/udp
sudo ufw allow 50000:50100/udp
sudo ufw reload
```

**Run diagnostic from local machine:**
```bash
cd /Users/bobbymini/Documents/tradezone-chatbot-dashboard
./scripts/diagnose-livekit.sh
```

### 2. LiveKit Agent Workers

**Check if workers are running:**
```bash
# In Python agent directory
cd agents/voice
source venv/bin/activate
python agent.py dev
```

**Watch for these log messages:**
```
✅ Good: "registered worker" with agentName: "amara"
❌ Bad: "audio filter cannot be enabled: LiveKit Cloud is required"
❌ Bad: "no response from servers"
```

---

## 🧪 Testing After Setup

### 1. Run Environment Diagnostic

```bash
cd /Users/bobbymini/Documents/tradezone-chatbot-dashboard
python3 scripts/check-livekit-env.py
```

**Expected output:**
```
✓ All configuration checks passed!
Ready to deploy voice agent.
```

### 2. Test Voice Connection

1. Open widget on tradezone.sg
2. Click microphone button
3. **Expected:** Agent says welcome message
4. **Speak:** "I want to trade my PS5"
5. **Expected:** Agent acknowledges and asks for details

**Check browser console for:**
- ✅ `[Voice] Room connected`
- ✅ `publishing track` (mic enabled)
- ❌ `cannot publish track when not connected` (should NOT appear)
- ❌ `dtls timeout` (should NOT appear)

### 3. Check LiveKit Server Logs

```bash
# On your LiveKit server
docker logs livekit-server --tail 100 -f
```

**Look for:**
- ✅ `participant active` with `connectionType: "udp"`
- ❌ `dtls timeout` (firewall issue)
- ❌ `PEER_CONNECTION_DISCONNECTED` (connectivity issue)

---

## 📋 Deployment Checklist

- [x] Python agent code updated (conditional noise cancellation)
- [x] `.env.local` updated with self-hosted URL
- [x] VOICE_NOISE_CANCELLATION set to false
- [ ] **ASSEMBLYAI_API_KEY added to .env.local** ⬅️ YOU ARE HERE
- [ ] Firewall allows UDP ports (check with diagnostic)
- [ ] Voice agent restarted with new config
- [ ] Widget tested end-to-end
- [ ] Committed changes to git

---

## 🚀 Deployment Steps (After Adding API Key)

### 1. Verify Configuration
```bash
python3 scripts/check-livekit-env.py
# Should show: "✓ All configuration checks passed!"
```

### 2. Restart Next.js Dev Server
```bash
npm run dev
# Or restart your production server
```

### 3. Restart Voice Agent (Production)
```bash
# In Coolify or your deployment platform:
# 1. Set environment variables (copy from .env.local)
# 2. Rebuild voice agent container from commit 6e5ef099 or newer
# 3. Deploy
```

### 4. Test Widget
```bash
# Open browser to:
https://tradezone.sg

# Click mic button and speak
# Agent should respond
```

### 5. Monitor Logs
```bash
# LiveKit server
docker logs livekit-server -f

# Voice agent (if running locally)
cd agents/voice && python agent.py dev
```

---

## 📝 Files Modified

1. **agents/voice/agent.py**
   - Added conditional noise cancellation import
   - Made room_options conditional on VOICE_NOISE_CANCELLATION

2. **.env.local**
   - Changed LIVEKIT_URL to wss://livekit.rezult.co
   - Added VOICE_NOISE_CANCELLATION=false
   - Added VOICE_STACK=classic
   - Added LIVEKIT_AGENT_NAME=amara

3. **scripts/check-livekit-env.py** (NEW)
   - Environment validation script

4. **scripts/diagnose-livekit.sh** (NEW)
   - Network/firewall diagnostic script

5. **public/widget/chat-widget-enhanced.js**
   - Already fixed in commit 14ec9ec9 (Dec 21)
   - Waits for RoomEvent.Connected before publishing mic

---

## 🔍 Troubleshooting

### Mic Not Working
1. **Check browser console** - Look for errors
2. **Run diagnostic** - `python3 scripts/check-livekit-env.py`
3. **Check firewall** - UDP ports must be open
4. **Verify API keys** - All keys must be set correctly

### Agent Not Responding
1. **Check agent logs** - Look for startup errors
2. **Verify ASSEMBLYAI_API_KEY** - Required for STT
3. **Check LiveKit connection** - Agent must connect to server
4. **Verify LIVEKIT_URL** - Must match server address

### DTLS Timeout Errors
1. **Open UDP ports** - 7881/udp and 50000-50100/udp
2. **Check firewall rules** - Both server and client side
3. **Test with diagnostic** - `./scripts/diagnose-livekit.sh`

---

## 📞 Support

If issues persist:
1. Run both diagnostic scripts
2. Collect logs (browser console + LiveKit server + voice agent)
3. Check agent.md for latest troubleshooting tips
4. Review CLAUDE.md for known issues

---

**Last Updated:** December 21, 2025
**Current Status:** Waiting for ASSEMBLYAI_API_KEY to be added
