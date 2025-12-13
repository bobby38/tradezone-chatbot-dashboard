# Voice Agent Pricing System

## How It Works

The voice agent uses Python-based pricing from `trade_in_prices_2025.json` for accurate, instant price quotes.

## Updating Prices

### Step 1: Edit the Price Grid
Edit the main price file:
```
data/trade_in_prices_2025.json
```

### Step 2: Sync to Voice Agent
```bash
cd agents/voice
./sync-price-grid.sh
```

### Step 3: Deploy
```bash
git add agents/voice/trade_in_prices_2025.json
git commit -m "Update pricing for [product name]"
git push origin feature/livekit-voice-agent
```

Coolify will auto-deploy the updated prices.

## Benefits

- ✅ **Single Source of Truth**: One JSON file controls all pricing
- ✅ **No Code Changes**: Add/remove products without touching code
- ✅ **Exact Match Priority**: "Nintendo Switch 2" returns exact price, not confused with "Gen 2"
- ✅ **Smart Clarification**: Asks questions only when multiple variants exist (PS5, Steam Deck)
- ✅ **Instant Updates**: Just update JSON, sync, and deploy

## File Locations

- **Master File**: `data/trade_in_prices_2025.json` (edit this)
- **Voice Copy**: `agents/voice/trade_in_prices_2025.json` (auto-synced)
- **Docker Image**: `/app/trade_in_prices_2025.json` (copied during build)
