# ChatKit Security Documentation

## 🔒 Security Overview

Your ChatKit system is now protected with **multi-layer security** to prevent spam, abuse, and excessive OpenAI API costs.

### Security Layers

1. **Rate Limiting** - IP and session-based throttling
2. **Authentication** - API key verification
3. **Input Validation** - Message length and content sanitization
4. **Budget Controls** - Daily spending limits
5. **CORS Restrictions** - Domain whitelisting
6. **Usage Monitoring** - Real-time cost tracking and alerts

---

## 🚀 Quick Start

### 1. Generate API Keys

```bash
npx ts-node scripts/setup-chatkit-security.ts
```

This will generate:
- Main API key (server-side)
- Widget API key (frontend)
- Dashboard API key (internal)

### 2. Run Database Migration

Open your Supabase SQL Editor and run:

```bash
migrations/001_chatkit_security_monitoring.sql
```

This creates:
- `chat_usage_metrics` - Token usage and cost tracking
- `chat_security_events` - Security incident logging
- Materialized views for analytics
- Helper functions for monitoring

### 3. Update Environment Variables

Add to your `.env.local`:

```bash
# ChatKit Security
CHATKIT_API_KEY=tzck_xxxxxxxxxxxx
NEXT_PUBLIC_CHATKIT_WIDGET_KEY=tzck_widget_xxxxxxxxxxxx
CHATKIT_ALLOWED_ORIGINS=tradezone.sg,www.tradezone.sg,rezult.co,www.rezult.co,trade.rezult.co
CHATKIT_DAILY_BUDGET=10.00

# Optional
CHATKIT_ALERT_WEBHOOK=https://hooks.slack.com/services/YOUR/WEBHOOK
```

### 4. Update Your Widget

Add API key to widget requests:

```javascript
// In your widget code
fetch('/api/chatkit/agent', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.NEXT_PUBLIC_CHATKIT_WIDGET_KEY
  },
  body: JSON.stringify({ message, sessionId, history })
})
```

### 5. Test Security

```bash
node scripts/test-chatkit-security.js
```

---

## 🛡️ Security Features

### Rate Limiting

**IP-based limits:**
- 20 requests per minute per IP
- Prevents spam from single source

**Session-based limits:**
- 50 requests per hour per session
- Prevents abuse of individual sessions

**Configuration:**
```typescript
// lib/security/rateLimit.ts
export const RATE_LIMITS = {
  CHATKIT_PER_IP: {
    maxRequests: 20,
    windowMs: 60 * 1000, // 1 minute
  },
  CHATKIT_PER_SESSION: {
    maxRequests: 50,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
}
```

### Input Validation

**Message limits:**
- Min length: 1 character
- Max length: 1,000 characters
- Sanitizes control characters

**History limits:**
- Max 20 conversation turns
- Auto-truncates to last 20

**Token budget:**
- Estimates token usage before API call
- Rejects requests exceeding 3,000 tokens

### Authentication

**API Key Methods:**

1. **X-API-Key header** (recommended):
```javascript
headers: {
  'X-API-Key': 'tzck_xxxxxxxxxxxx'
}
```

2. **Authorization Bearer**:
```javascript
headers: {
  'Authorization': 'Bearer tzck_xxxxxxxxxxxx'
}
```

**Origin Verification:**
- Checks request origin
- Whitelists: tradezone.sg, localhost (dev)
- Blocks unauthorized domains

### Budget Controls

**Daily limits:**
- Set via `CHATKIT_DAILY_BUDGET` env var
- Default: $10/day
- Returns 503 when exceeded

**Token limits:**
- Reduced max_tokens from 2000 to 800
- Saves ~60% on completion costs
- Still adequate for most responses

### CORS Restrictions

**Allowed origins:**
```typescript
const ALLOWED_ORIGINS = [
  'https://tradezone.sg',
  'https://www.tradezone.sg',
  'https://rezult.co',
  'https://www.rezult.co',
  'https://trade.rezult.co',
  // localhost in dev mode
]
```

**Headers returned:**
- `Access-Control-Allow-Origin`: Specific domain only
- `Access-Control-Allow-Credentials`: true
- `Access-Control-Allow-Headers`: Includes X-API-Key

---

## 📊 Monitoring & Analytics

### Real-time Metrics

View in database:

```sql
-- Today's usage
SELECT * FROM get_usage_summary(
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '1 day'
);

-- Suspicious IPs (last 24 hours)
SELECT * FROM get_suspicious_ips(24, 10);

-- High-cost sessions
SELECT session_id, SUM(estimated_cost) as total_cost
FROM chat_usage_metrics
WHERE timestamp > NOW() - INTERVAL '1 day'
GROUP BY session_id
ORDER BY total_cost DESC
LIMIT 10;
```

### Security Events

Monitor suspicious activity:

```sql
-- Recent security events
SELECT 
  event_type,
  COUNT(*) as count,
  ARRAY_AGG(DISTINCT client_ip) as ips
FROM chat_security_events
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY event_type;

-- Top blocked IPs
SELECT 
  client_ip,
  COUNT(*) as block_count,
  MAX(timestamp) as last_blocked
FROM chat_security_events
WHERE event_type = 'rate_limit_hit'
  AND timestamp > NOW() - INTERVAL '24 hours'
GROUP BY client_ip
ORDER BY block_count DESC
LIMIT 20;
```

### Cost Tracking

**By model:**
```sql
SELECT 
  model,
  COUNT(*) as requests,
  SUM(total_tokens) as tokens,
  ROUND(SUM(estimated_cost)::numeric, 4) as cost
FROM chat_usage_metrics
WHERE timestamp > CURRENT_DATE
GROUP BY model;
```

**Hourly breakdown:**
```sql
SELECT * FROM hourly_usage_summary
WHERE hour > NOW() - INTERVAL '24 hours'
ORDER BY hour DESC;
```

### Materialized Views

Auto-refreshing analytics views:

- `daily_usage_summary` - Daily metrics by endpoint/model
- `hourly_usage_summary` - Hourly request patterns
- `top_ips_by_usage` - Top 100 IPs by usage (7 days)

Refresh manually:
```sql
SELECT refresh_usage_views();
```

---

## ⚙️ Configuration Reference

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CHATKIT_API_KEY` | Yes | - | Main server-side API key |
| `NEXT_PUBLIC_CHATKIT_WIDGET_KEY` | Yes | - | Frontend widget key |
| `CHATKIT_ALLOWED_ORIGINS` | No | tradezone.sg | Comma-separated domains |
| `CHATKIT_DAILY_BUDGET` | No | 10 | Daily budget in USD |
| `CHATKIT_DISABLE_AUTH` | No | false | Disable auth in dev mode |
| `CHATKIT_ALERT_WEBHOOK` | No | - | Webhook for alerts |

### Rate Limit Overrides

Override defaults via environment:

```bash
CHATKIT_RATE_LIMIT_PER_IP=20
CHATKIT_RATE_LIMIT_PER_SESSION=50
```

### Validation Limits

Defined in `lib/security/validation.ts`:

```typescript
export const VALIDATION_LIMITS = {
  MAX_MESSAGE_LENGTH: 1000,
  MAX_HISTORY_LENGTH: 20,
  MAX_SESSION_ID_LENGTH: 100,
  MIN_MESSAGE_LENGTH: 1,
}
```

---

## 🚨 Alert System

### Webhook Alerts

Set up Slack/Discord webhook:

```bash
CHATKIT_ALERT_WEBHOOK=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

**Alert triggers:**
- Daily budget exceeded
- High usage detected (>2000 tokens or >$0.05/request)
- Suspicious activity patterns

**Payload format:**
```json
{
  "type": "budget_exceeded",
  "details": {
    "current": 10.50,
    "limit": 10.00,
    "timestamp": "2025-01-11T10:30:00Z"
  },
  "timestamp": "2025-01-11T10:30:00Z"
}
```

---

## 🔧 Troubleshooting

### Common Issues

**1. "Unauthorized" errors**

Check:
- API key is set in `.env.local`
- Widget includes `X-API-Key` header
- Key matches exactly (no spaces/typos)

```bash
# Verify key is loaded
echo $CHATKIT_API_KEY
```

**2. "Too many requests" (429)**

Normal behavior for rate limiting:
- Wait time shown in `retryAfter` field
- Check if legitimate user or bot attack
- Review `chat_security_events` table

**3. "Service temporarily unavailable" (503)**

Daily budget exceeded:
- Check current spend in `chat_usage_metrics`
- Increase `CHATKIT_DAILY_BUDGET` if needed
- Wait until tomorrow for reset

**4. CORS errors**

Verify:
- Origin is in `CHATKIT_ALLOWED_ORIGINS`
- Widget uses correct domain
- No trailing slashes in origins

### Disable Auth (Development Only)

```bash
# .env.local
CHATKIT_DISABLE_AUTH=true
NODE_ENV=development
```

⚠️ **Never disable auth in production!**

---

## 📈 Cost Optimization

### Current Settings

- **Max tokens**: 800 (reduced from 2000)
- **Model**: gpt-4.1-mini (balanced cost/performance)
- **Temperature**: 0.7 (balanced)

### Estimated Costs

**GPT-4.1-mini pricing:**
- Input: $0.40 per 1M tokens
- Output: $1.60 per 1M tokens

**Typical request:**
- Prompt: ~500 tokens
- Completion: ~300 tokens
- Cost: ~$0.0007 per request

**At scale:**
- 1,000 requests/day: ~$0.70/day
- 10,000 requests/day: ~$7/day
- 100,000 requests/day: ~$70/day

### Optimization Tips

1. **Reduce history length:**
```typescript
// Keep only last 10 turns instead of 20
MAX_HISTORY_LENGTH: 10
```

2. **Lower max_tokens:**
```typescript
// Reduce to 500 for shorter responses
max_tokens: 500
```

3. **Use streaming:**
```typescript
// Stop generation early if response is adequate
stream: true
```

4. **Cache common queries:**
```typescript
// Cache FAQ responses
if (isFAQ(message)) {
  return getCachedResponse(message);
}
```

---

## 🔐 Security Best Practices

### API Key Management

✅ **DO:**
- Rotate keys every 90 days
- Use different keys for dev/prod
- Store in `.env.local` (gitignored)
- Use `NEXT_PUBLIC_*` only for frontend

❌ **DON'T:**
- Commit keys to git
- Share keys in Slack/email
- Use same key for all environments
- Expose server keys to frontend

### Monitoring

**Daily checks:**
1. Review `daily_usage_summary` view
2. Check `chat_security_events` for anomalies
3. Verify budget not exceeded
4. Monitor error rates

**Weekly tasks:**
1. Refresh materialized views
2. Review top IPs by usage
3. Check for new attack patterns
4. Update rate limits if needed

**Monthly tasks:**
1. Rotate API keys
2. Cleanup old metrics (>90 days)
3. Analyze cost trends
4. Adjust budgets

### Incident Response

**If budget exceeded:**
1. Check `chat_usage_metrics` for spike
2. Identify source (IP/session)
3. Block malicious IPs
4. Adjust rate limits
5. Increase budget if legitimate

**If suspicious activity:**
1. Query `get_suspicious_ips()` function
2. Review `chat_security_events` table
3. Block offending IPs at firewall
4. Tighten rate limits temporarily
5. File security report

---

## 📝 Migration Checklist

- [ ] Run `setup-chatkit-security.ts` script
- [ ] Execute database migration SQL
- [ ] Add API keys to `.env.local`
- [ ] Update widget with `X-API-Key` header
- [ ] Test with `test-chatkit-security.js`
- [ ] Set OpenAI usage limits in dashboard
- [ ] Configure alert webhook (optional)
- [ ] Monitor first 24 hours closely
- [ ] Document custom rate limits
- [ ] Train team on security practices

---

## 🆘 Support

**Issues:**
- GitHub: [Create issue](https://github.com/your-repo/issues)
- Email: dev@tradezone.sg

**Documentation:**
- Main docs: `/CLAUDE.md`
- API reference: `/docs/api.md`
- Security: `/SECURITY.md` (this file)

**Emergency:**
- Disable endpoint: Comment out route handler
- Block IP: Add to Vercel firewall
- Revoke key: Remove from env and restart

---

## 🔄 Version History

- **v1.0.0** (2025-01-11) - Initial security implementation
  - Multi-layer rate limiting
  - API key authentication
  - Usage monitoring & cost tracking
  - Budget controls
  - CORS restrictions

---

**Remember:** Security is an ongoing process. Review and update these measures regularly.

✅ Your ChatKit system is now secured and monitored!
