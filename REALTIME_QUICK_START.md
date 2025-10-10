# GPT Realtime Mini - Quick Start

## 🚀 5-Minute Setup

### 1. Set Environment Variables

Add to `.env.local`:

```bash
OPENAI_API_KEY=sk-proj-your-key-here
OPENAI_VECTOR_STORE_ID=vs_your-vector-store-id
OPENAI_REALTIME_MODEL=gpt-4o-mini-realtime-preview-2024-12-17
PERPLEXITY_API_KEY=pplx-your-key-here
```

### 2. Start Development Server

```bash
npm run dev
```

### 3. Test Voice Chat

1. Navigate to: `http://localhost:3000/dashboard/chat`
2. Click **"VOICE CHAT"**
3. Click **"Start Voice Chat"**
4. Allow microphone access
5. Say: **"Hello Izacc, search for PlayStation 5"**

### 4. Verify It Works

✅ You should see:
- Status: "Connected" → "Listening..."
- Your speech transcribed
- AI responds with voice
- Product search results

### 5. Check Which Model is Actually Being Used

⚠️ **Important**: Look for this in browser console:
```javascript
[Realtime Session]: {
  model: "gpt-4o-mini-realtime-preview-2024-12-17"  // ✅ Good!
}
```

If you see `gpt-4o-realtime-preview-2024-12-17` instead, the API fell back to the full model (higher cost). This is a known OpenAI API issue.

## 🐛 Quick Debug

### Issue: No connection

```bash
# Check API key
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

### Issue: No audio playback

- Check browser console for errors
- Verify system audio is not muted
- Try: `new Audio('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3').play()`

### Issue: Microphone not working

- Grant permissions in browser settings
- Ensure using HTTPS or localhost
- Check: `navigator.mediaDevices.getUserMedia({ audio: true })`

## 📊 Test Script

Run in browser console:

```javascript
// Quick health check
fetch('/api/chatkit/realtime', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sessionId: 'test' })
})
.then(r => r.json())
.then(d => console.log('Config:', d.success ? '✅' : '❌', d));
```

## 📚 Full Documentation

- **Setup Guide**: `/docs/gpt-realtime-mini-guide.md`
- **Troubleshooting**: `/docs/realtime-troubleshooting.md`
- **Architecture**: See "How It Works" section in main guide

## 💰 Cost Estimates

**GPT-4o-mini Realtime** (default):
- ~$0.10/hour audio input
- ~$0.40/hour audio output
- **Total: ~$0.50/hour** of conversation

**GPT-4o Realtime** (premium):
- ~$0.60/hour audio input
- ~$2.40/hour audio output
- **Total: ~$3.00/hour** of conversation

## 🎯 Key Features

- ✅ Real-time voice conversations
- ✅ Low latency (~200-300ms)
- ✅ Automatic speech-to-text
- ✅ Natural text-to-speech
- ✅ Product search integration
- ✅ Email inquiry tool
- ✅ Server-side turn detection

## 🔧 What Was Fixed

### v1.1.1 (Latest)
- ✅ Fixed missing `session.type` parameter error
- ✅ Added `type: "response"` to session config

### v1.1.0
- ✅ Full audio playback with queue
- ✅ PCM16 → Float32 conversion
- ✅ Configurable model (mini/full)
- ✅ Enhanced error handling

### v1.0.0 (Initial)
- ❌ Audio chunks received but not played
- ❌ Only console logging
- ❌ Model hardcoded to gpt-4o-realtime

## 📞 Support

Issues? Check:
1. Browser console logs
2. `/docs/realtime-troubleshooting.md`
3. Email: contactus@tradezone.sg
