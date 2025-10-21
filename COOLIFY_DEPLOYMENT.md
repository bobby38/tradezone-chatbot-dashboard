# 🚀 Coolify Deployment Guide - TradeZone ChatBot Dashboard

## Quick Deploy Checklist

- [ ] Copy environment variables from `.env.coolify`
- [ ] Run database migration in Supabase
- [ ] Upload Google credentials JSON file
- [ ] Deploy to Coolify
- [ ] Test ChatKit endpoints
- [ ] Verify security measures

---

## Step 1: Copy Environment Variables to Coolify

### Method A: Copy from `.env.coolify` file

1. Open `.env.coolify` file in your project
2. Copy ALL variables
3. In Coolify dashboard:
   - Go to your project → **Environment Variables**
   - Click **Add Variable** or **Bulk Edit**
   - Paste all variables
   - Click **Save**

### Method B: Manual Entry

Required variables for ChatKit Security:

```bash
# ChatKit Security (REQUIRED)
CHATKIT_API_KEY=tzck_YOUR_MAIN_API_KEY_HERE
NEXT_PUBLIC_CHATKIT_WIDGET_KEY=tzck_widget_YOUR_WIDGET_KEY_HERE
CHATKIT_DASHBOARD_KEY=tzck_dashboard_YOUR_DASHBOARD_KEY_HERE
CHATKIT_ALLOWED_ORIGINS=tradezone.sg,www.tradezone.sg,rezult.co,www.rezult.co,trade.rezult.co
CHATKIT_DAILY_BUDGET=10.00
```

---

## Step 2: Handle Google Credentials JSON

### Option A: Environment Variable (Recommended)

1. **Minify your JSON file:**
```bash
cat tradezone-analytics-n8n-project.json | jq -c
```

2. **Copy the minified output** (single line)

3. **In Coolify, add:**
```bash
GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account","project_id":"..."}
```

4. **Update your code** to read from env variable:
```typescript
// In your app
const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON 
  ? JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)
  : require('./path/to/file.json');
```

### Option B: Upload File to Coolify Storage

1. In Coolify: **Storage** → **Upload File**
2. Upload `tradezone-analytics-n8n-project.json`
3. Note the file path (e.g., `/app/credentials/tradezone-analytics.json`)
4. Add environment variable:
```bash
GOOGLE_APPLICATION_CREDENTIALS=/app/credentials/tradezone-analytics.json
```

---

## Step 3: Run Database Migration

Before deploying, create monitoring tables in Supabase:

1. Open **Supabase SQL Editor**: https://supabase.com/dashboard/project/jvkmxtbckpfwypnbubdy/sql
2. Copy contents of `migrations/001_chatkit_security_monitoring.sql`
3. Click **Run**
4. Verify tables created:
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('chat_usage_metrics', 'chat_security_events');
```

Expected output:
```
table_name
-------------------
chat_usage_metrics
chat_security_events
```

---

## Step 4: Deploy to Coolify

### Using Git (Recommended)

1. **Push to repository:**
```bash
git add .
git commit -m "Add ChatKit security features"
git push origin main
```

2. **In Coolify:**
   - Go to your project
   - Click **Deploy**
   - Wait for build to complete

### Using Manual Upload

1. **Create production build:**
```bash
npm run build
```

2. **Zip the project:**
```bash
zip -r tradezone-dashboard.zip . -x "node_modules/*" ".git/*" ".next/*"
```

3. **Upload to Coolify:**
   - Go to project → **Upload**
   - Select zip file
   - Deploy

---

## Step 5: Configure Coolify Settings

### Build Settings

```yaml
# Build Command
npm install && npm run build

# Start Command
npm start

# Port
3000

# Health Check Path
/api/health (or create one)
```

### Environment

```yaml
# Node Version
NODE_VERSION=20

# Environment
NODE_ENV=production
```

---

## Step 6: Post-Deployment Verification

### Test ChatKit Endpoints

**1. Health Check:**
```bash
curl https://trade.rezult.co/api/chatkit/agent
```

Expected: `200 OK` with health status

**2. Test Authentication:**
```bash
# Without API key (should fail)
curl -X POST https://trade.rezult.co/api/chatkit/agent \
  -H "Content-Type: application/json" \
  -d '{"message":"test","sessionId":"test"}'
```

Expected: `401 Unauthorized`

**3. Test with API key:**
```bash
curl -X POST https://trade.rezult.co/api/chatkit/agent \
  -H "Content-Type: application/json" \
  -H "X-API-Key: tzck_YOUR_MAIN_API_KEY_HERE" \
  -d '{"message":"test","sessionId":"test-123"}'
```

Expected: `200 OK` with chat response

**4. Test Rate Limiting:**

Run this 25 times to trigger rate limit:
```bash
for i in {1..25}; do
  curl -X POST https://trade.rezult.co/api/chatkit/agent \
    -H "Content-Type: application/json" \
    -H "X-API-Key: tzck_YOUR_MAIN_API_KEY_HERE" \
    -d "{\"message\":\"test $i\",\"sessionId\":\"rate-test\"}"
  echo ""
done
```

Expected: After ~20 requests, you should see `429 Too Many Requests`

---

## Step 7: Update Your Widget

### On TradeZone.sg

Update your widget code to use the new API key:

```javascript
// In your chat widget JavaScript
const CHATKIT_API_KEY = 'tzck_widget_YOUR_WIDGET_KEY_HERE';

async function sendMessage(message, sessionId, history = []) {
  const response = await fetch('https://trade.rezult.co/api/chatkit/agent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': CHATKIT_API_KEY, // ✅ Add this
    },
    body: JSON.stringify({ message, sessionId, history })
  });
  
  return response.json();
}
```

### For Realtime Voice Chat

```javascript
// Get realtime config
const configResponse = await fetch('https://trade.rezult.co/api/chatkit/realtime', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'tzck_widget_YOUR_WIDGET_KEY_HERE', // ✅ Add this
  },
  body: JSON.stringify({ sessionId: 'your-session-id' })
});
```

---

## Step 8: Monitor Usage

### In Supabase Dashboard

**Daily Usage:**
```sql
SELECT * FROM daily_usage_summary 
WHERE date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY date DESC;
```

**Today's Cost:**
```sql
SELECT 
  SUM(total_tokens) as tokens,
  ROUND(SUM(estimated_cost)::numeric, 2) as cost
FROM chat_usage_metrics
WHERE timestamp >= CURRENT_DATE;
```

**Security Events:**
```sql
SELECT 
  event_type,
  COUNT(*) as count,
  MAX(timestamp) as last_seen
FROM chat_security_events
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY event_type;
```

### Set Up Alerts (Optional)

**1. Create Slack/Discord Webhook:**
- Slack: https://api.slack.com/messaging/webhooks
- Discord: Server Settings → Integrations → Webhooks

**2. Add to Coolify environment:**
```bash
CHATKIT_ALERT_WEBHOOK=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

**3. Test alert:**
```bash
curl -X POST $CHATKIT_ALERT_WEBHOOK \
  -H "Content-Type: application/json" \
  -d '{
    "text": "🚨 ChatKit Alert Test",
    "blocks": [{
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "ChatKit security monitoring is active!"
      }
    }]
  }'
```

---

## Troubleshooting

### Issue: "Unauthorized" errors

**Check:**
1. API key is set in Coolify environment
2. Widget includes `X-API-Key` header
3. Key matches exactly (no spaces)

**Fix:**
```bash
# In Coolify, verify:
echo $CHATKIT_API_KEY
# Should output: tzck_YOUR_MAIN_API_KEY_HERE
```

### Issue: CORS errors

**Check:**
1. Request origin is in allowed list
2. Headers include API key

**Fix:**
Update `CHATKIT_ALLOWED_ORIGINS` in Coolify to include your domain

### Issue: "Service temporarily unavailable" (503)

**Reason:** Daily budget exceeded

**Check:**
```sql
SELECT SUM(estimated_cost) as today_cost
FROM chat_usage_metrics
WHERE timestamp >= CURRENT_DATE;
```

**Fix:**
Increase `CHATKIT_DAILY_BUDGET` in Coolify environment

### Issue: Google Analytics not working

**Check:**
1. Credentials JSON is properly set
2. File path is correct if using file upload

**Fix:**
```bash
# Verify in Coolify logs:
console.log('GA Credentials:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
```

### Issue: High memory usage

**Symptom:** App crashes or restarts frequently

**Reason:** Rate limiter storing too many entries

**Fix:**
In Coolify, increase memory limit:
- Go to project → **Resources**
- Memory: Set to at least 512MB
- Or implement Redis-based rate limiting

---

## Performance Optimization

### 1. Enable Caching

Add to Coolify environment:
```bash
NEXT_PUBLIC_ENABLE_CACHE=true
```

### 2. Use CDN for Static Assets

In Coolify:
- Enable **Asset Optimization**
- Set **CDN URL** if available

### 3. Enable Compression

```bash
# Next.js automatically compresses, but verify:
NEXT_COMPRESS=true
```

### 4. Monitor Resource Usage

In Coolify Dashboard:
- Check **CPU Usage**
- Check **Memory Usage**
- Check **Network Traffic**

Set alerts if:
- CPU > 80% for 5 minutes
- Memory > 90%
- Response time > 3s

---

## Scaling Considerations

### When to Scale Up

**Symptoms:**
- Response times > 2s consistently
- Rate limits hit frequently by legitimate users
- Memory usage > 80%

**Actions:**
1. Increase Coolify resources (CPU/Memory)
2. Adjust rate limits:
```typescript
// lib/security/rateLimit.ts
CHATKIT_PER_IP: {
  maxRequests: 30, // Increase from 20
}
```

### When to Add Redis

**When:**
- Running multiple instances
- Rate limiter memory > 100MB
- Need distributed rate limiting

**Setup:**
1. Add Redis to Coolify
2. Install `@upstash/ratelimit`
3. Update `lib/security/rateLimit.ts`

---

## Security Checklist for Production

- [ ] API keys are unique and secure
- [ ] `CHATKIT_DISABLE_AUTH` is NOT set to `true`
- [ ] CORS origins only include your domains
- [ ] Daily budget is set appropriately
- [ ] OpenAI usage limits configured
- [ ] Database migration completed
- [ ] Monitoring tables have data
- [ ] Alert webhook tested (if configured)
- [ ] Widget uses HTTPS only
- [ ] API keys not exposed in client code
- [ ] Coolify logs reviewed for errors

---

## Environment Variables Reference

### Required (Must Set)

```bash
CHATKIT_API_KEY=tzck_YOUR_MAIN_API_KEY_HERE
NEXT_PUBLIC_CHATKIT_WIDGET_KEY=tzck_widget_YOUR_WIDGET_KEY_HERE
```

### Recommended

```bash
CHATKIT_ALLOWED_ORIGINS=tradezone.sg,www.tradezone.sg,rezult.co,www.rezult.co,trade.rezult.co
CHATKIT_DAILY_BUDGET=10.00
```

### Optional

```bash
CHATKIT_DASHBOARD_KEY=tzck_dashboard_YOUR_DASHBOARD_KEY_HERE
CHATKIT_ALERT_WEBHOOK=https://hooks.slack.com/...
```

### Development Only (Remove in Production)

```bash
# CHATKIT_DISABLE_AUTH=true  ❌ NEVER SET IN PRODUCTION
```

---

## Support & Resources

**Documentation:**
- Security: `/SECURITY.md`
- Setup Guide: `/CHATKIT_SECURITY_SETUP.md`
- Main Docs: `/CLAUDE.md`

**Monitoring:**
- Supabase: https://supabase.com/dashboard/project/jvkmxtbckpfwypnbubdy
- OpenAI Usage: https://platform.openai.com/usage
- Coolify Logs: Your Coolify dashboard → Logs

**Emergency:**
- Disable endpoint: Remove route in Coolify
- Block IP: Add to firewall rules
- Revoke key: Update env and redeploy

---

✅ **Deployment Complete!**

Your ChatKit is now secured and running on Coolify with:
- Multi-layer security
- Cost controls
- Real-time monitoring
- Auto-scaling ready

**Next steps:**
1. Monitor usage first 24 hours
2. Adjust rate limits based on traffic
3. Set up alert notifications
4. Review security events weekly

🎉 Happy deploying!
