# LiveKit Voice Agent

## 📚 Documentation Overview

### Quick Links
- **🚀 Quick Start** - [`QUICK_START.md`](QUICK_START.md) - Start here! 3 simple steps
- **🧪 Testing & Deployment** - [`TESTING_DEPLOYMENT_GUIDE.md`](TESTING_DEPLOYMENT_GUIDE.md) - Complete guide
- **📊 Current Status** - [`AGENT_STATUS.md`](AGENT_STATUS.md) - Agent running status
- **🔄 Migration Info** - [`MIGRATION_SUMMARY.md`](MIGRATION_SUMMARY.md) - Why LiveKit?

### Voice Agent Files
- **📁 voice/** - Python agent code
  - `agent.py` - Main agent (currently running)
  - `SETUP.md` - Installation guide
  - `README.md` - Technical details

### What You Get

✅ **3x faster** voice response (450ms vs 1500ms)  
✅ **50% cheaper** ($0.03/min vs $0.06/min)  
✅ **Singapore region** (local, low latency)  
✅ **Same tools** as text chat (full sync)  
✅ **Same database** (Supabase chat_logs)  

## 🎯 Next Steps

### Today (15 minutes)
1. Install package: `npm install livekit-server-sdk`
2. Start dev server: `npm run dev`
3. Open `test-voice.html` in browser
4. Click "Connect & Start Call"
5. Test: "Do you have PS5 games?"

### Tomorrow (2 hours)
1. Deploy Python agent to Coolify
2. Update widget to use LiveKit
3. Test on production

## 📖 Documentation Structure

```
agents/
├── README.md                          ← You are here
├── QUICK_START.md                     ← Start here (simple)
├── TESTING_DEPLOYMENT_GUIDE.md        ← Complete guide (detailed)
├── AGENT_STATUS.md                    ← Current status
├── MIGRATION_SUMMARY.md               ← Why LiveKit vs OpenAI
└── voice/
    ├── agent.py                       ← Main Python agent
    ├── SETUP.md                       ← Installation
    └── README.md                      ← Technical docs
```

## 🔧 Test Files Created

- `test-voice.html` - Beautiful test page with checklist
- `app/api/livekit/token/route.ts` - Token generation API

## 💡 Key Concepts

### Hybrid Architecture
```
User speaks → LiveKit Cloud → Python Agent
                                   ↓
                            Calls Next.js APIs
                                   ↓
                            Saves to Supabase
                                   ↓
                    Same database as text chat
```

### Tools Available
1. **searchProducts** - Search product catalog
2. **searchtool** - Search website content  
3. **tradein_update_lead** - Save trade-in details
4. **tradein_submit_lead** - Submit trade-in
5. **sendemail** - Contact support

All tools call your existing Next.js APIs!

## 🆘 Quick Troubleshooting

**Agent not running?**
```bash
cd agents/voice
source venv/bin/activate
python agent.py dev
```

**Test page can't connect?**
```bash
# Check if dev server is running
npm run dev

# Check if LiveKit credentials are in .env.local
```

**Tools not executing?**
- Check agent logs for HTTP errors
- Verify `NEXT_PUBLIC_API_URL=http://localhost:3001`
- Verify `CHATKIT_API_KEY` matches

## 📞 Support

1. Check `QUICK_START.md` for simple steps
2. Check `TESTING_DEPLOYMENT_GUIDE.md` for detailed help
3. Check agent logs: `cd agents/voice && tail -f *.log`
4. Check LiveKit dashboard: https://cloud.livekit.io

## 🎓 Learning Resources

- **LiveKit Docs**: https://docs.livekit.io
- **LiveKit Agents**: https://docs.livekit.io/agents/overview
- **Python SDK**: https://docs.livekit.io/realtime/server/python

---

**Status**: Agent running and ready to test! 🚀

See [`QUICK_START.md`](QUICK_START.md) for next steps.
