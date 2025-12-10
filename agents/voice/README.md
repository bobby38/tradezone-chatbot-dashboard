# TradeZone Voice Agent - LiveKit Integration

## Overview
This is a Python-based LiveKit agent that provides voice chat for TradeZone.sg. It calls the existing Next.js APIs to keep all business logic in sync with text chat.

## Why LiveKit?
- ✅ **Better Latency**: ~200ms faster than OpenAI Realtime API
- ✅ **Better Voice Quality**: WebRTC audio instead of WebSocket
- ✅ **Better Interruption**: Smoother turn-taking
- ✅ **Multiple Providers**: Deepgram STT + Cartesia TTS (faster than OpenAI)
- ✅ **Production Ready**: Battle-tested infrastructure

## Architecture
```
Voice User (LiveKit)
        ↓
Python Agent (this)
        ↓
Next.js APIs (existing logic)
        ↓
Supabase (shared state with text chat)
```

## Setup

### 1. Install Dependencies
```bash
cd agents/voice
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Environment Variables
Create `.env.local` with:
```bash
# LiveKit
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret
LIVEKIT_URL=wss://your-project.livekit.cloud

# Next.js API
NEXT_PUBLIC_API_URL=https://trade.rezult.co
CHATKIT_API_KEY=your-api-key

# AI Providers
OPENAI_API_KEY=your-openai-key
DEEPGRAM_API_KEY=your-deepgram-key
CARTESIA_API_KEY=your-cartesia-key
```

### 3. Run Agent
```bash
python agent.py dev
```

## Features

### Voice Optimizations
- **Deepgram Nova 2**: Low-latency speech-to-text (~100ms)
- **Cartesia Sonic 3**: Ultra-low latency text-to-speech (~50ms)
- **Preemptive Generation**: Starts generating before user finishes
- **VAD**: Silero voice activity detection
- **Noise Cancellation**: Automatic background noise removal

### Shared Logic with Text Chat
All tools call existing Next.js APIs:
- `searchProducts` → `/api/tools/search`
- `tradein_update_lead` → `/api/tradein/update`
- `tradein_submit_lead` → `/api/tradein/submit`
- `sendemail` → `/api/tools/email`

This ensures:
- ✅ Same database (Supabase)
- ✅ Same business logic
- ✅ Same validation rules
- ✅ Text and voice stay 100% in sync

## Deployment

### Option 1: LiveKit Cloud (Recommended)
1. Sign up at https://cloud.livekit.io
2. Deploy agent to LiveKit Cloud
3. Connect from frontend

### Option 2: Self-Hosted
1. Deploy LiveKit server
2. Run this agent on your server
3. Configure frontend to connect

## Monitoring
- LiveKit dashboard shows real-time metrics
- Agent logs to stdout
- All state saved to Supabase (shared with text chat)

## Rollback
If issues occur, switch back to OpenAI Realtime API:
```bash
git checkout main
```
The old implementation is preserved on `main` branch.
