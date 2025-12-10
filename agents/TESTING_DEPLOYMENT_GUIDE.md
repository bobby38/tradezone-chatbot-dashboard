# LiveKit Voice Agent - Testing & Deployment Guide

## 📋 Complete Checklist

### Phase 1: Local Testing ✅ (DONE)
- [x] Python agent running locally
- [x] Connected to LiveKit Cloud (Singapore)
- [x] Agent shows READY status
- [ ] Test voice interaction
- [ ] Verify tools work (searchProducts, tradein_update_lead, etc.)
- [ ] Verify chat logs saved to Supabase

### Phase 2: Frontend Testing (NEXT STEP)
- [ ] Create test HTML page
- [ ] Connect to LiveKit room
- [ ] Test voice conversation
- [ ] Verify all 5 tools execute correctly
- [ ] Verify chat logs appear in dashboard

### Phase 3: Coolify Deployment
- [ ] Deploy Python agent to Coolify
- [ ] Configure environment variables
- [ ] Test production agent
- [ ] Update widget to use LiveKit

### Phase 4: Widget Integration
- [ ] Update widget voice button
- [ ] Test on tradezone.sg
- [ ] Verify tool execution
- [ ] Verify chat log sync

---

## 🧪 Phase 2: How to Test Voice Agent

### Option A: Simple HTML Test Page (RECOMMENDED)

Create this file to test the agent:

**File: `test-voice.html`** (create in project root)

```html
<!DOCTYPE html>
<html>
<head>
  <title>LiveKit Voice Test</title>
  <script src="https://unpkg.com/@livekit/components-core@0.11.0/dist/livekit-components-core.umd.js"></script>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 600px;
      margin: 50px auto;
      padding: 20px;
    }
    button {
      padding: 15px 30px;
      font-size: 18px;
      cursor: pointer;
      background: #007bff;
      color: white;
      border: none;
      border-radius: 5px;
      margin: 10px;
    }
    button:hover {
      background: #0056b3;
    }
    button:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
    #status {
      padding: 15px;
      margin: 20px 0;
      background: #f0f0f0;
      border-radius: 5px;
    }
    #transcript {
      padding: 15px;
      margin: 20px 0;
      background: #e8f4f8;
      border-radius: 5px;
      min-height: 200px;
      max-height: 400px;
      overflow-y: auto;
    }
    .message {
      margin: 10px 0;
      padding: 10px;
      border-radius: 5px;
    }
    .user {
      background: #d1e7dd;
      text-align: right;
    }
    .agent {
      background: #fff3cd;
    }
  </style>
</head>
<body>
  <h1>🎙️ LiveKit Voice Agent Test</h1>
  
  <div id="status">
    <strong>Status:</strong> <span id="statusText">Not connected</span>
  </div>

  <button id="connectBtn" onclick="connect()">Connect & Start Call</button>
  <button id="disconnectBtn" onclick="disconnect()" disabled>Disconnect</button>

  <div id="transcript">
    <p><em>Transcript will appear here...</em></p>
  </div>

  <script>
    let room;
    let connected = false;

    async function connect() {
      try {
        updateStatus('Connecting...');
        
        // Get LiveKit token from your backend
        const response = await fetch('http://localhost:3001/api/livekit/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomName: 'test-room-' + Date.now(),
            participantName: 'Test User'
          })
        });

        const { token, url } = await response.json();

        // Connect to LiveKit room
        room = new LivekitComponentsCore.Room();
        
        await room.connect(url, token, {
          audio: true,
          video: false
        });

        updateStatus('Connected! Agent should join automatically...');
        document.getElementById('connectBtn').disabled = true;
        document.getElementById('disconnectBtn').disabled = false;
        connected = true;

        // Listen for agent messages
        room.on('trackSubscribed', (track, publication, participant) => {
          if (track.kind === 'audio' && participant.identity.includes('amara')) {
            updateStatus('🤖 Agent joined! You can speak now.');
            
            // Play agent audio
            const audioElement = track.attach();
            document.body.appendChild(audioElement);
          }
        });

        // Listen for transcripts (if available)
        room.on('dataReceived', (payload, participant) => {
          try {
            const data = JSON.parse(new TextDecoder().decode(payload));
            if (data.type === 'transcript') {
              addTranscript(data.role, data.text);
            }
          } catch (e) {
            console.log('Data received:', payload);
          }
        });

      } catch (error) {
        console.error('Connection error:', error);
        updateStatus('❌ Error: ' + error.message);
      }
    }

    async function disconnect() {
      if (room) {
        await room.disconnect();
        updateStatus('Disconnected');
        document.getElementById('connectBtn').disabled = false;
        document.getElementById('disconnectBtn').disabled = true;
        connected = false;
      }
    }

    function updateStatus(text) {
      document.getElementById('statusText').textContent = text;
    }

    function addTranscript(role, text) {
      const transcript = document.getElementById('transcript');
      const msg = document.createElement('div');
      msg.className = 'message ' + role;
      msg.innerHTML = `<strong>${role === 'user' ? 'You' : 'Agent'}:</strong> ${text}`;
      transcript.appendChild(msg);
      transcript.scrollTop = transcript.scrollHeight;
    }
  </script>
</body>
</html>
```

### Create Token Generation API

**File: `app/api/livekit/token/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';

export async function POST(req: NextRequest) {
  try {
    const { roomName, participantName } = await req.json();

    const apiKey = process.env.LIVEKIT_API_KEY!;
    const apiSecret = process.env.LIVEKIT_API_SECRET!;

    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantName,
    });

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });

    const token = at.toJwt();

    return NextResponse.json({
      token,
      url: process.env.LIVEKIT_URL,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
```

### Install Required Package

```bash
npm install livekit-server-sdk
```

### Test Steps

1. **Start Next.js dev server:**
   ```bash
   npm run dev
   ```

2. **Start LiveKit agent** (in another terminal):
   ```bash
   cd agents/voice
   source venv/bin/activate
   python agent.py dev
   ```

3. **Open test page:**
   ```bash
   open test-voice.html
   # Or just drag test-voice.html into your browser
   ```

4. **Test the flow:**
   - Click "Connect & Start Call"
   - Wait for "Agent joined! You can speak now."
   - **Say:** "Do you have PS5 games?"
   - **Expect:** Agent should call `searchProducts` tool and respond with products
   - **Say:** "I want to trade in my PS4"
   - **Expect:** Agent should call `tradein_update_lead` tool

5. **Verify chat logs:**
   - Go to: http://localhost:3001/dashboard/logs
   - Look for new entries with your test session
   - Should show tool calls and responses

---

## 🚀 Phase 3: Coolify Deployment

### Step 1: Create Dockerfile for Agent

**File: `agents/voice/Dockerfile`**

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download model files
COPY agent.py .
RUN python agent.py download-files

# Copy application
COPY . .

# Run agent
CMD ["python", "agent.py", "start"]
```

### Step 2: Update agent.py for Production

Add production command to `agents/voice/agent.py`:

```python
# Add this at the bottom of agent.py

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        if sys.argv[1] == "download-files":
            # Download model files
            cli.download_files()
            sys.exit(0)
        elif sys.argv[1] == "start":
            # Production mode - connect and stay running
            cli.connect()
            
            # Keep alive
            import asyncio
            import signal
            
            def signal_handler(sig, frame):
                print("\nShutting down agent...")
                sys.exit(0)
            
            signal.signal(signal.SIGINT, signal_handler)
            signal.signal(signal.SIGTERM, signal_handler)
            
            # Run forever
            loop = asyncio.get_event_loop()
            loop.run_forever()
    else:
        # Default: dev mode
        cli.download_files()
        cli.connect()
```

### Step 3: Deploy to Coolify

**Option A: Deploy as Separate Service (RECOMMENDED)**

1. **In Coolify Dashboard:**
   - Create new service → Docker Compose
   - Name: `tradezone-voice-agent`
   - Repository: Your repo
   - Build context: `agents/voice`

2. **Environment Variables in Coolify:**
   ```env
   LIVEKIT_URL=wss://tradezone-9kwy60jr.livekit.cloud
   LIVEKIT_API_KEY=your_key
   LIVEKIT_API_SECRET=your_secret
   OPENAI_API_KEY=your_openai_key
   ASSEMBLYAI_API_KEY=your_assemblyai_key
   CARTESIA_API_KEY=your_cartesia_key
   NEXT_PUBLIC_API_URL=https://trade.rezult.co
   CHATKIT_API_KEY=your_chatkit_key
   ```

3. **Deploy:**
   - Push to branch
   - Coolify auto-deploys
   - Check logs for "Agent running"

**Option B: Add to Existing docker-compose.yml**

Add this service to your existing Coolify docker-compose:

```yaml
services:
  # ... existing services ...

  voice-agent:
    build:
      context: ./agents/voice
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      - LIVEKIT_URL=${LIVEKIT_URL}
      - LIVEKIT_API_KEY=${LIVEKIT_API_KEY}
      - LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - ASSEMBLYAI_API_KEY=${ASSEMBLYAI_API_KEY}
      - CARTESIA_API_KEY=${CARTESIA_API_KEY}
      - NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
      - CHATKIT_API_KEY=${CHATKIT_API_KEY}
    healthcheck:
      test: ["CMD", "python", "-c", "import sys; sys.exit(0)"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Step 4: Verify Production Deployment

1. **Check LiveKit Dashboard:**
   - Go to: https://cloud.livekit.io/projects
   - Click your project
   - Go to "Agents" tab
   - Should see "amara" agent READY

2. **Test with HTML page:**
   - Update `test-voice.html` to use production URL
   - Change `http://localhost:3001` → `https://trade.rezult.co`
   - Test voice interaction

---

## 🎨 Phase 4: Widget Integration

### Current Widget Voice Flow

Your existing widget uses OpenAI Realtime API. Here's how to migrate:

### Option A: Replace OpenAI Realtime with LiveKit (RECOMMENDED)

**File: `public/widget/chat-widget-enhanced.js`**

Find the voice initialization code and replace with:

```javascript
// Add at top of file
let livekitRoom = null;
let livekitConnected = false;

// Replace existing voice button handler
async function startVoiceCall() {
  try {
    updateVoiceStatus('Connecting...');
    
    // Get LiveKit token
    const response = await fetch(`${API_BASE}/api/livekit/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomName: `widget-${sessionId}`,
        participantName: sessionId
      })
    });

    const { token, url } = await response.json();

    // Import LiveKit client
    const { Room, RoomEvent } = await import('https://unpkg.com/livekit-client@2.0.0/dist/livekit-client.esm.mjs');

    // Connect to room
    livekitRoom = new Room();
    
    await livekitRoom.connect(url, token, {
      audio: true,
      video: false
    });

    updateVoiceStatus('🤖 Connected! Speak now...');
    livekitConnected = true;

    // Handle agent audio
    livekitRoom.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === 'audio') {
        const audioElement = track.attach();
        audioElement.play();
      }
    });

    // Handle transcripts and tool calls
    livekitRoom.on(RoomEvent.DataReceived, (payload) => {
      try {
        const data = JSON.parse(new TextDecoder().decode(payload));
        
        if (data.type === 'transcript') {
          addMessageToChat(data.role, data.text);
        }
        
        if (data.type === 'tool_call') {
          // Log tool execution
          console.log('Tool called:', data.tool, data.args);
        }
      } catch (e) {
        console.error('Data parse error:', e);
      }
    });

  } catch (error) {
    console.error('Voice call error:', error);
    updateVoiceStatus('❌ Connection failed');
  }
}

async function stopVoiceCall() {
  if (livekitRoom) {
    await livekitRoom.disconnect();
    livekitRoom = null;
    livekitConnected = false;
    updateVoiceStatus('Disconnected');
  }
}

function updateVoiceStatus(status) {
  const statusEl = document.getElementById('voice-status');
  if (statusEl) {
    statusEl.textContent = status;
  }
}
```

### Option B: Keep Both (Gradual Migration)

Add LiveKit as alternative mode:

```javascript
// Add voice mode selector
function showVoiceModeSelector() {
  return `
    <div class="voice-mode-selector">
      <button onclick="startVoiceCall('openai')">OpenAI Realtime</button>
      <button onclick="startVoiceCall('livekit')">LiveKit (Faster)</button>
    </div>
  `;
}

async function startVoiceCall(mode = 'livekit') {
  if (mode === 'livekit') {
    await startLiveKitVoice();
  } else {
    await startOpenAIVoice(); // existing code
  }
}
```

---

## ✅ Verification Checklist

### Must Verify All Tools Work:

1. **searchProducts Tool:**
   - Say: "Do you have PS5 games?"
   - Check: Should call `/api/tools/search`
   - Verify: Chat log shows tool call
   - Verify: Response includes product links

2. **searchtool (Perplexity):**
   - Say: "What's your return policy?"
   - Check: Should call `/api/tools/perplexity`
   - Verify: Chat log shows tool call
   - Verify: Response has accurate info

3. **tradein_update_lead:**
   - Say: "I want to trade my PS4"
   - Agent: "What model?"
   - You: "PS4 Pro 1TB"
   - Check: Should call `/api/tradein/update`
   - Verify: Dashboard → Trade-in shows new lead

4. **tradein_submit_lead:**
   - Complete trade-in flow
   - Provide: name, phone, email
   - Say: "Submit it"
   - Check: Should call `/api/tradein/submit`
   - Verify: Email sent to contactus@tradezone.sg

5. **sendemail:**
   - Say: "I need to speak to someone"
   - Check: Should call `/api/tools/email`
   - Verify: Email sent to staff

### Must Verify Chat Logs:

1. **Go to Dashboard:** http://localhost:3001/dashboard/logs
   
2. **Check entries contain:**
   - ✅ Session ID (e.g., "widget-Guest-1234")
   - ✅ User messages
   - ✅ Agent responses
   - ✅ Tool calls logged
   - ✅ Source = "livekit" or "voice"

3. **Verify session detail page:**
   - Click on session
   - Should show full conversation
   - Should show tool execution timeline

### Must Verify Product Links:

When agent responds with products, verify format:

```
Agent: "We have these PS5 games:
1. Gran Turismo 7 - S$79.90
   https://tradezone.sg/product/gran-turismo-7

2. FIFA 24 - S$69.90
   https://tradezone.sg/product/fifa-24"
```

✅ Links must be clickable
✅ Links must go to correct product pages
✅ Prices must match current stock

---

## 🔄 Rollback Plan

If LiveKit has issues, instant rollback:

```bash
# Switch back to main branch
git checkout main
git push origin main --force

# In Coolify
# Just redeploy - will use main branch code
# OpenAI Realtime will work again
```

All OpenAI Realtime code is preserved on `main` branch!

---

## 📊 Cost Comparison

### Current (OpenAI Realtime):
- **Per Minute:** $0.06
- **100 hours/month:** $360
- **Region:** US East (higher latency for Singapore users)

### LiveKit Setup:
- **Per Minute:** $0.03
- **100 hours/month:** $180
- **Region:** Singapore (local, faster)
- **Savings:** 50% = $180/month

### Breakdown (100 hours = 6000 minutes):
- AssemblyAI: ~$13/month (or free tier)
- GPT-4.1-mini: ~$60/month
- Cartesia: ~$15/month (or free tier)
- LiveKit: Free (under 10k min/month)
- **Total:** ~$90/month vs $360/month = **75% savings!**

---

## 🎯 Next Steps

1. **TODAY:** Test voice with HTML page
2. **TODAY:** Verify all 5 tools work
3. **TODAY:** Check chat logs sync
4. **TOMORROW:** Deploy to Coolify
5. **TOMORROW:** Update widget
6. **TOMORROW:** Test on production
7. **NEXT WEEK:** Monitor performance

---

## 🆘 Troubleshooting

### Agent not joining room?
```bash
# Check agent logs
cd agents/voice
source venv/bin/activate
python agent.py dev

# Should see:
# Agent registered: amara
# Agent status: READY
```

### No audio from agent?
- Check browser console for errors
- Verify microphone permissions granted
- Check LiveKit dashboard shows active room

### Tools not executing?
- Check agent logs for HTTP errors
- Verify `NEXT_PUBLIC_API_URL` is correct
- Verify `CHATKIT_API_KEY` matches

### Chat logs not appearing?
- Check Supabase `chat_logs` table
- Verify agent can reach Next.js APIs
- Check API endpoint logs in Coolify

### Widget not connecting?
- Check token generation API works
- Verify LIVEKIT_API_KEY/SECRET in env
- Check browser console for CORS errors

---

## 📞 Support

If stuck:
1. Check `agents/AGENT_STATUS.md` for current status
2. Check agent logs: `agents/voice/*.log`
3. Check LiveKit dashboard: https://cloud.livekit.io
4. Check API logs in Coolify

Ready to test! Start with the HTML test page. 🚀
