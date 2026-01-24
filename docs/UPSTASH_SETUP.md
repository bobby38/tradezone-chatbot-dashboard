# 🚀 Upstash Redis Setup Guide

## Why Upstash?

Your current rate limiter uses **in-memory storage**, which:
- ❌ Doesn't work with serverless (Vercel/Lambda)
- ❌ Resets on every deployment
- ❌ Can't scale horizontally (multiple servers)

Upstash Redis provides:
- ✅ **Distributed rate limiting** (works across all servers)
- ✅ **Serverless-friendly** (works on Vercel/Netlify/Lambda)
- ✅ **Persists across deployments**
- ✅ **FREE tier: 10,000 requests/day** (perfect for TradeZone)

---

## 💰 Pricing (Super Cheap!)

### Free Tier (Recommended)
- ✅ **10,000 requests per day** (your current usage: ~500/day)
- ✅ **Unlimited databases**
- ✅ **Global replication**
- ✅ **No credit card required**

### Paid Tier (if you go viral)
- **$0.20 per 100,000 requests**
- Example: 100K requests/day = $6/month

**Verdict**: You'll stay free forever unless traffic explodes! 🎉

---

## 📝 Step-by-Step Setup (5 minutes)

### 1. Create Upstash Account

Visit: **https://upstash.com**

- Click "Sign Up" (use GitHub or email)
- No credit card required!

### 2. Create Redis Database

1. Click **"Create Database"** in the Upstash dashboard
2. **Settings**:
   - **Name**: `tradezone-ratelimit` (or any name you like)
   - **Type**: Regional (cheaper) or Global (faster worldwide)
   - **Region**: Choose closest to your Coolify server (e.g., `ap-southeast-1` for Singapore)
   - **Eviction**: Enable (automatically remove old data)

3. Click **"Create"**

### 3. Copy Credentials

After creating the database, you'll see:

```
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

**⚠️ Important**: Use the **REST API** credentials (not TCP/Redis URL)

### 4. Add to Coolify Environment

Go to your **Coolify dashboard** → Environment Variables:

```bash
UPSTASH_REDIS_URL=https://your-db-xxxxx.upstash.io
UPSTASH_REDIS_TOKEN=AXrxASQgxxxxxxxxxxxxxxxxxx
```

**Example**:
```bash
UPSTASH_REDIS_URL=https://glowing-manta-12345.upstash.io
UPSTASH_REDIS_TOKEN=AXrxASQgN2M2YTJlMDYtNmFjYi00OGY3LWI5YTYtZjU5ZjU2ZjY2ZjY2
```

### 5. Redeploy on Coolify

After adding the environment variables:
- Click **"Redeploy"** in Coolify
- Wait for deployment to finish

### 6. Verify It's Working

Check your Coolify logs after deployment. You should see:

```
✅ [RateLimit] Upstash Redis configured - using distributed rate limiting
```

**If you see this instead**:
```
ℹ️  [RateLimit] Upstash not configured - using in-memory fallback
```

Double-check:
- Environment variables are spelled correctly (`UPSTASH_REDIS_URL`, `UPSTASH_REDIS_TOKEN`)
- You redeployed after adding the variables
- Variables are set in the **main** Coolify app (not preview/branch)

---

## 🧪 Testing Rate Limits

### Test via curl (hit the limit)

```bash
# Hit ChatKit API 25 times (limit is 20/min)
for i in {1..25}; do
  curl -X POST https://trade.rezult.co/api/chatkit/agent \
    -H "Content-Type: application/json" \
    -H "X-API-Key: YOUR_CHATKIT_KEY" \
    -d '{"message":"test","sessionId":"test-session"}' \
    -w "\nStatus: %{http_code}\n"
done
```

**Expected output**:
- Requests 1-20: `Status: 200` ✅
- Requests 21-25: `Status: 429` (Rate limit exceeded) ✅

**Response headers**:
```
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 2025-01-07T12:34:56.789Z
Retry-After: 45
```

---

## 🎯 What Changed in Your Code?

The system now **automatically** switches between:

1. **Upstash Redis** (if `UPSTASH_REDIS_URL` is set) → Production-ready ✅
2. **In-memory fallback** (if Upstash not configured) → Local dev only ⚠️

**No code changes needed!** Just add environment variables and redeploy.

---

## 📊 Monitoring Usage (Optional)

### Upstash Dashboard
1. Go to https://console.upstash.com
2. Click your `tradezone-ratelimit` database
3. View:
   - **Requests per day** (should stay under 10K for free tier)
   - **Storage used** (rate limit data is tiny, ~1MB)
   - **Peak usage times**

### Coolify Logs
Watch for rate limit blocks:
```bash
# SSH into Coolify and tail logs
docker logs -f <your-container-id> | grep RateLimit
```

You'll see:
```
[RateLimit] Blocked 123.45.67.89 on /api/chatkit/agent - 45s retry
```

---

## ❓ Troubleshooting

### "In-memory fallback" message in logs

**Problem**: Upstash credentials not detected

**Solution**:
1. Verify environment variables exist in Coolify:
   ```bash
   echo $UPSTASH_REDIS_URL
   echo $UPSTASH_REDIS_TOKEN
   ```
2. Restart the app (redeploy in Coolify)
3. Check for typos in variable names

### "Upstash error, falling back to in-memory"

**Problem**: Upstash API error (network/auth issue)

**Solution**:
1. Check credentials are correct (copy from Upstash dashboard again)
2. Verify firewall allows outbound HTTPS to `*.upstash.io`
3. Check Upstash status: https://status.upstash.com

### Rate limit not working in development

**Expected behavior**: Rate limits are **disabled** for `localhost` (127.0.0.1) in dev mode.

To test rate limits locally:
1. Use a different IP (via proxy/VPN)
2. Set `NODE_ENV=production` temporarily
3. Or deploy to Coolify staging

---

## 🔐 Security Notes

- ✅ **Credentials are secret**: Never commit `UPSTASH_REDIS_TOKEN` to Git
- ✅ **Environment-only**: Only store in Coolify env vars (or `.env.local` for dev)
- ✅ **Read-only mode**: Upstash credentials have minimal permissions (just rate limiting)

---

## 🎉 Next Steps

After setup, you can:
- Scale to multiple servers (load balancer ready)
- Deploy on Vercel/Netlify (serverless compatible)
- Handle traffic spikes (Redis persists state)

**Cost**: FREE (unless you exceed 10K requests/day, which would mean ~500 visitors/day!)

---

**Questions?** Check the Upstash docs: https://upstash.com/docs/redis/overall/getstarted
