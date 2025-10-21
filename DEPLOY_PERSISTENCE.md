# 🚀 Deploy Chat Persistence to Production

## Current Situation

✅ **Code committed to GitHub:** `de055fc`
❌ **Production (trade.rezult.co) has old widget:** No persistence
🌐 **tradezone.sg loads widget from:** `https://trade.rezult.co/widget/chat-widget-enhanced.js`

## Solution: Deploy to Coolify

### Option 1: Auto-Deploy (If Coolify is connected to GitHub)

Coolify should auto-deploy when you push to `main` branch.

**Check deployment status:**
1. Go to Coolify dashboard
2. Check if deployment started automatically
3. Wait for build to complete (~2-3 minutes)

### Option 2: Manual Deploy (If auto-deploy disabled)

**In Coolify Dashboard:**
1. Go to your project
2. Click "Deploy" button
3. Wait for build to complete

### Option 3: Force Rebuild

If Coolify didn't detect changes:

**In Coolify:**
1. Go to project settings
2. Click "Redeploy" or "Force Rebuild"
3. Select branch: `main`
4. Deploy

---

## 🧪 Verify Deployment

### Step 1: Check Widget Version

Open browser console on tradezone.sg and run:

```javascript
// Check if new code is loaded
localStorage.getItem('tz_client_id')
// Should return: "client_1729180800000_a1b2c3d4e" or similar

// Check widget version
console.log('[TradeZone] Testing persistence...')
```

### Step 2: Test Persistence

1. Open tradezone.sg
2. Open chat widget
3. Send message: "Do you have PS5?"
4. **Refresh the page**
5. Open chat widget again
6. ✅ **VERIFY:** Message should still be there!

### Step 3: Check Console Logs

You should see:

```javascript
[TradeZone] New client ID created: client_xxx_xxx
[TradeZone] New session created: client_xxx_xxx_xxx
[TradeZone Chat Enhanced] Widget initialized client_xxx_xxx

// After refresh:
[TradeZone] Resuming session: client_xxx_xxx_xxx
[TradeZone] Loaded 2 messages from storage
[TradeZone] Rendered 2 messages from history
```

---

## 🔍 Troubleshooting

### Widget Still Shows Old Version?

**Cause:** Browser cache or CDN cache

**Fix:**
```javascript
// Hard refresh the page
// Mac: Cmd + Shift + R
// Windows: Ctrl + Shift + R

// Or clear cache:
// DevTools → Network → Disable cache (checkbox)
```

### Coolify Not Deploying?

**Check:**
1. GitHub webhook configured in Coolify?
2. Branch name correct (`main` not `master`)?
3. Build logs for errors?

**Manual trigger:**
```bash
# In Coolify, click "Redeploy" button
```

### Still Not Working?

**Check widget URL:**
```javascript
// In browser console on tradezone.sg:
document.querySelector('script[src*="chat-widget"]').src
// Should return: https://trade.rezult.co/widget/chat-widget-enhanced.js
```

**Check if file updated:**
```bash
# Visit directly:
https://trade.rezult.co/widget/chat-widget-enhanced.js

# Search for: "getOrCreateClientId"
# If found → New version ✅
# If not found → Old version ❌ (need to deploy)
```

---

## 📋 Deployment Checklist

```
□ Code committed to GitHub (main branch) ✅
□ Coolify deployment triggered
□ Build completed successfully
□ Widget file updated on trade.rezult.co
□ Browser cache cleared
□ Test on tradezone.sg
□ Verify localStorage keys created
□ Verify history persists on refresh
□ Check console logs for persistence messages
```

---

## ⚡ Quick Deploy Commands

If you have SSH access to the server:

```bash
# SSH into server
ssh your-server

# Navigate to project
cd /path/to/tradezone-chatbot-dashboard

# Pull latest code
git pull origin main

# Restart service (if needed)
pm2 restart tradezone-dashboard
# or
systemctl restart tradezone-dashboard
```

---

## 🎯 Expected Timeline

- **Auto-deploy:** 2-3 minutes
- **Manual deploy:** 5 minutes
- **Cache clear:** Immediate
- **Total:** ~5-10 minutes

---

## ✅ Success Criteria

When deployment is successful, you should see on **tradezone.sg**:

1. ✅ Chat history persists after page refresh
2. ✅ localStorage keys (`tz_client_id`, `tz_session_id`, `tz_chat_history`) exist
3. ✅ Console shows "Resuming session" on refresh
4. ✅ Bot introduces as "Amara" (not "Izacc")
5. ✅ Product links remain accessible after navigation

---

**Next Step:** Check your Coolify dashboard to see if deployment started automatically, or manually trigger a deploy.
