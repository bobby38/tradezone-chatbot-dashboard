# LiveKit Setup Guide for TradeZone Voice Agent

## Quick Start (5 minutes)

### Step 1: Sign up for LiveKit Cloud
1. Go to https://cloud.livekit.io
2. Sign up for free account (includes free tier)
3. Create a new project called "tradezone-voice"

### Step 2: Get API Credentials
1. In LiveKit Cloud dashboard, go to "Settings" → "Keys"
2. Copy your:
   - API Key
   - API Secret
   - WebSocket URL (e.g., `wss://tradezone-xxxxx.livekit.cloud`)

### Step 3: Configure Environment Variables
Add to your `.env.local`:

```bash
# LiveKit Cloud
LIVEKIT_API_KEY=APIxxxxxxxxxxxxx
LIVEKIT_API_SECRET=your-secret-key
LIVEKIT_URL=wss://tradezone-xxxxx.livekit.cloud

# AI Providers (sign up for free tiers)
OPENAI_API_KEY=sk-xxxxx  # You already have this
DEEPGRAM_API_KEY=xxxxx   # Get from https://deepgram.com (free tier: 12k min/month)
CARTESIA_API_KEY=xxxxx   # Get from https://cartesia.ai (free tier available)

# Your existing Next.js API
NEXT_PUBLIC_API_URL=http://localhost:3001  # Local dev
# NEXT_PUBLIC_API_URL=https://trade.rezult.co  # Production
CHATKIT_API_KEY=your-existing-api-key
```

### Step 4: Install Python Dependencies
```bash
cd agents/voice
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### Step 5: Test Agent Locally
```bash
python agent.py dev
```

You should see:
```
INFO:agent-amara:Agent started successfully
INFO:agent-amara:Waiting for room connections...
```

### Step 6: Update Frontend Widget
Add LiveKit SDK to your frontend (already done in Next.js):
```bash
npm install @livekit/components-react livekit-client
```

## Latency Comparison

### Current (OpenAI Realtime API):
- STT: ~300ms (OpenAI Whisper)
- Processing: ~400ms (GPT-4)
- TTS: ~800ms (OpenAI TTS)
- **Total: ~1.5 seconds**

### New (LiveKit + Optimized Providers):
- STT: ~100ms (Deepgram Nova 2)
- Processing: ~300ms (GPT-4.1-mini)
- TTS: ~50ms (Cartesia Sonic 3)
- **Total: ~450ms** ✅ **3x faster!**

## Voice Quality

### Cartesia Sonic 3 Voice
The agent uses voice ID `9626c31c-bec5-4cca-baa8-f8ba9e84c8bc` which is:
- Female voice (similar to OpenAI "nova")
- Natural, conversational tone
- Low latency optimized
- Clear pronunciation

To change voice:
1. Browse voices at https://play.cartesia.ai/
2. Copy the voice ID
3. Update `agent.py` line with new voice ID

## Deployment Options

### Option A: LiveKit Cloud (Recommended for Production)
**Pros:**
- Fully managed
- Global edge network
- Auto-scaling
- No server maintenance
- Free tier: 10,000 minutes/month

**Steps:**
1. Deploy agent to LiveKit Cloud via dashboard
2. Upload `agent.py` and dependencies
3. Configure environment variables
4. Done! LiveKit handles scaling

### Option B: Self-Hosted
**Pros:**
- Full control
- No usage limits
- Can run on your infrastructure

**Steps:**
1. Deploy LiveKit server (Docker)
2. Run Python agent on your server
3. Configure networking

## Testing Checklist

### Local Testing
- [ ] Agent starts without errors
- [ ] Can connect to LiveKit room
- [ ] Voice greeting plays
- [ ] STT transcribes correctly
- [ ] Tools call Next.js APIs successfully
- [ ] TTS sounds natural

### Production Testing
- [ ] Test from mobile device
- [ ] Test with different accents
- [ ] Test latency under load
- [ ] Verify trade-in flow works
- [ ] Check Supabase logs sync with text chat

## Monitoring

### LiveKit Dashboard
- Real-time room connections
- Audio quality metrics
- Latency graphs
- Error logs

### Your Existing Logs
- All tool calls logged to Supabase
- Same `chat_logs` table as text chat
- Same `trade_in_leads` table

## Rollback Plan

If issues occur:
```bash
# Switch back to OpenAI Realtime API
git checkout main
git push origin main

# Delete LiveKit feature branch
git branch -D feature/livekit-voice-agent
```

The old voice implementation is preserved and can be restored instantly.

## Cost Comparison

### Current (OpenAI Realtime API)
- ~$0.06 per minute of conversation
- ~$180/month for 50 hours

### New (LiveKit + Optimized Stack)
- Deepgram: ~$0.0043/minute (free tier available)
- GPT-4.1-mini: ~$0.015/1k tokens (~$0.02/minute)
- Cartesia: ~$0.005/minute (free tier available)
- LiveKit: Free tier up to 10k min/month
- **Total: ~$0.03/minute** ✅ **50% cheaper!**

## Support

- LiveKit Docs: https://docs.livekit.io
- LiveKit Discord: https://livekit.io/discord
- Deepgram Docs: https://developers.deepgram.com
- Cartesia Docs: https://docs.cartesia.ai

## Next Steps

1. Sign up for LiveKit Cloud (5 min)
2. Get Deepgram API key (2 min)
3. Get Cartesia API key (2 min)
4. Test agent locally (1 min)
5. Deploy to production (10 min)

**Total setup time: ~20 minutes** for 3x faster, 50% cheaper voice experience!
