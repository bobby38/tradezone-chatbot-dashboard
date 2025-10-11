# 🤖 TradeZone Chatbot Dashboard

Enterprise-grade AI chatbot dashboard with real-time analytics, security, and cost optimization for TradeZone.sg.

![Status](https://img.shields.io/badge/status-production-success)
![Security](https://img.shields.io/badge/security-enabled-blue)
![Cost](https://img.shields.io/badge/cost-optimized-green)

---

## 🚀 Features

### ✅ ChatKit AI System
- **Multi-language Support** - Text and voice chat powered by OpenAI
- **Product Search** - Vector search across WooCommerce catalog
- **Web Search** - Perplexity AI integration for real-time answers
- **Email Integration** - Automated inquiry handling

### 🔒 Security (NEW - v1.0.0)
- **API Key Authentication** - Secure endpoint access
- **Rate Limiting** - 20 req/min per IP, 50 req/hr per session
- **Input Validation** - Sanitization and length limits
- **Budget Controls** - Daily spending limits ($10 default)
- **CORS Protection** - Domain whitelisting
- **Usage Monitoring** - Real-time cost tracking

### 📊 Analytics Dashboard
- **Google Analytics 4** - Real-time traffic metrics
- **Search Console** - SEO performance tracking
- **WooCommerce** - Order and product analytics
- **Chat Analytics** - Session tracking and conversation insights

### 💬 Chat Management
- **Session Grouping** - Organized conversation threads
- **Real-time Monitoring** - Live chat status
- **Export Capabilities** - CSV/JSON data export
- **Search & Filter** - Advanced query tools

---

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Security Setup](#security-setup)
- [Deployment](#deployment)
- [Environment Variables](#environment-variables)
- [API Documentation](#api-documentation)
- [Cost Optimization](#cost-optimization)
- [Troubleshooting](#troubleshooting)

---

## ⚡ Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn
- Supabase account
- OpenAI API key

### Installation

```bash
# Clone repository
git clone <your-repo-url>
cd tradezone-chatbot-dashboard

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Run development server
npm run dev
```

Visit: http://localhost:3001

---

## 🔐 Security Setup

**IMPORTANT:** Security is enabled by default. Follow these steps:

### 1. Generate API Keys

```bash
npx ts-node scripts/setup-chatkit-security.ts
```

This creates:
- `CHATKIT_API_KEY` - Server-side key (keep secret)
- `NEXT_PUBLIC_CHATKIT_WIDGET_KEY` - Frontend key
- `CHATKIT_DASHBOARD_KEY` - Internal use

### 2. Run Database Migration

In Supabase SQL Editor, run:
```sql
-- migrations/001_chatkit_security_monitoring_SAFE.sql
```

Creates tables:
- `chat_usage_metrics` - Token usage tracking
- `chat_security_events` - Security logs

### 3. Update Environment

Add to `.env.local`:
```bash
CHATKIT_API_KEY=tzck_xxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_CHATKIT_WIDGET_KEY=tzck_widget_xxxxxxxxxxxxxxxxxxxxx
CHATKIT_ALLOWED_ORIGINS=tradezone.sg,rezult.co,trade.rezult.co
CHATKIT_DAILY_BUDGET=10.00
```

### 4. Update Widget Code

```javascript
// In your chat widget
fetch('/api/chatkit/agent', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.NEXT_PUBLIC_CHATKIT_WIDGET_KEY // Add this
  },
  body: JSON.stringify({ message, sessionId, history })
})
```

📖 **Full Guide:** See [SECURITY.md](./SECURITY.md)

---

## 🚀 Deployment

### Coolify Deployment

1. **Copy environment variables** from `.env.coolify`
2. **Run database migration** in Supabase
3. **Deploy** via Coolify dashboard
4. **Verify** security endpoints

📖 **Full Guide:** See [COOLIFY_DEPLOYMENT.md](./COOLIFY_DEPLOYMENT.md)

### Vercel/Other Platforms

Same steps apply. Ensure:
- All environment variables are set
- Database migration completed
- API keys configured

---

## 🔧 Environment Variables

### Required

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI
OPENAI_API_KEY=sk-proj-...
OPENAI_VECTOR_STORE_ID=vs_...

# ChatKit Security (Generate with script)
CHATKIT_API_KEY=tzck_...
NEXT_PUBLIC_CHATKIT_WIDGET_KEY=tzck_widget_...
```

### Optional

```bash
# Budget & Monitoring
CHATKIT_DAILY_BUDGET=10.00
CHATKIT_ALLOWED_ORIGINS=tradezone.sg,rezult.co
CHATKIT_ALERT_WEBHOOK=https://hooks.slack.com/...

# Analytics
GA_PROPERTY=your-ga4-property-id
SC_SITE=sc-domain:tradezone.sg

# WooCommerce
WC_SITE=https://tradezone.sg
WC_KEY=ck_...
WC_SECRET=cs_...
```

📖 **Full List:** See [.env.coolify](./.env.coolify)

---

## 📡 API Documentation

### ChatKit Endpoints

#### POST `/api/chatkit/agent`
Main chat endpoint with security.

**Headers:**
```
Content-Type: application/json
X-API-Key: tzck_widget_xxxxxxxxxxxxxxxxxxxxx
```

**Request:**
```json
{
  "message": "What gaming laptops do you have?",
  "sessionId": "session-123",
  "history": [
    {"role": "user", "content": "Hi"},
    {"role": "assistant", "content": "Hello! How can I help?"}
  ]
}
```

**Response:**
```json
{
  "response": "Here are our gaming laptops...",
  "sessionId": "session-123",
  "model": "gpt-4o-mini",
  "usage": {
    "promptTokens": 150,
    "completionTokens": 80,
    "totalTokens": 230
  }
}
```

#### POST `/api/chatkit/realtime`
Realtime voice chat configuration.

**Security:**
- Rate limit: 10 req/min
- Requires API key
- Returns WebSocket config

### Analytics Endpoints

#### GET `/api/ga/summary`
Google Analytics summary.

#### GET `/api/sc/supabase`
Search Console data from Supabase.

#### GET `/api/woocommerce/orders`
WooCommerce order data.

---

## 💰 Cost Optimization

### Current Settings

| Feature | Before | After | Savings |
|---------|--------|-------|---------|
| Max tokens | 2000 | 800 | **60%** |
| Rate limiting | None | 20/min | **~90%** spam blocked |
| Budget control | None | $10/day | **~75%** cost reduction |

### Expected Costs (GPT-4o-mini)

| Traffic | Requests/Day | Cost/Day | Cost/Month |
|---------|--------------|----------|------------|
| Low | 100 | $0.03 | $1 |
| Medium | 1,000 | $0.30 | $9 |
| High | 10,000 | $3.00 | $90 |

**Daily budget limit:** $10 (configurable)

### Monitor Usage

```sql
-- Today's cost
SELECT 
  SUM(total_tokens) as tokens,
  ROUND(SUM(estimated_cost)::numeric, 2) as cost
FROM chat_usage_metrics
WHERE timestamp >= CURRENT_DATE;
```

---

## 🛠️ Development

### Project Structure

```
tradezone-chatbot-dashboard/
├── app/
│   ├── api/
│   │   ├── chatkit/          # ChatKit endpoints
│   │   │   ├── agent/        # Main chat API
│   │   │   └── realtime/     # Voice chat
│   │   ├── ga/               # Google Analytics
│   │   ├── sc/               # Search Console
│   │   └── woocommerce/      # WooCommerce
│   ├── dashboard/            # Dashboard pages
│   └── components/           # React components
├── lib/
│   ├── security/             # Security utilities (NEW)
│   │   ├── rateLimit.ts
│   │   ├── validation.ts
│   │   ├── auth.ts
│   │   └── monitoring.ts
│   ├── chatkit/              # ChatKit utilities
│   └── tools/                # AI tools
├── migrations/               # Database migrations
└── scripts/                  # Setup scripts
```

### Key Technologies

- **Framework:** Next.js 14
- **Database:** Supabase (PostgreSQL)
- **AI:** OpenAI GPT-4o-mini
- **Analytics:** Google Analytics 4, Search Console
- **E-commerce:** WooCommerce API
- **Styling:** Tailwind CSS
- **UI Components:** Radix UI

### Available Scripts

```bash
npm run dev          # Development server
npm run build        # Production build
npm run start        # Production server
npm run lint         # Run ESLint
```

---

## 🔍 Monitoring

### Usage Dashboard

View metrics in Supabase:

```sql
-- Daily summary
SELECT * FROM daily_usage_summary 
WHERE date >= CURRENT_DATE - INTERVAL '7 days';

-- Suspicious IPs
SELECT * FROM get_suspicious_ips(24, 10);

-- Security events
SELECT * FROM chat_security_events
WHERE timestamp > NOW() - INTERVAL '1 hour';
```

### Materialized Views

Auto-updated analytics:
- `daily_usage_summary` - Daily metrics
- `hourly_usage_summary` - Hourly patterns
- `top_ips_by_usage` - Top 100 IPs (7 days)

Refresh manually:
```sql
SELECT refresh_usage_views();
```

---

## 🐛 Troubleshooting

### "Unauthorized" Error

**Cause:** Missing or invalid API key

**Fix:**
1. Check `CHATKIT_API_KEY` is set
2. Verify widget includes `X-API-Key` header
3. Ensure key matches exactly

### "Too Many Requests" (429)

**Cause:** Rate limit exceeded

**Normal behavior** - Security working correctly

**Fix:**
- Wait for retry period (shown in response)
- Check if legitimate traffic or attack
- Adjust limits in `lib/security/rateLimit.ts`

### "Service Unavailable" (503)

**Cause:** Daily budget exceeded

**Fix:**
```sql
-- Check today's spending
SELECT SUM(estimated_cost) FROM chat_usage_metrics
WHERE timestamp >= CURRENT_DATE;
```

Increase `CHATKIT_DAILY_BUDGET` if needed

### CORS Error

**Cause:** Request from unauthorized domain

**Fix:**
Add domain to `CHATKIT_ALLOWED_ORIGINS`:
```bash
CHATKIT_ALLOWED_ORIGINS=tradezone.sg,your-domain.com
```

---

## 📚 Documentation

- **[SECURITY.md](./SECURITY.md)** - Complete security guide
- **[COOLIFY_DEPLOYMENT.md](./COOLIFY_DEPLOYMENT.md)** - Deployment guide
- **[CHATKIT_SECURITY_SETUP.md](./CHATKIT_SECURITY_SETUP.md)** - Quick setup
- **[DEPLOYMENT_SUMMARY.md](./DEPLOYMENT_SUMMARY.md)** - Quick reference
- **[CLAUDE.md](./CLAUDE.md)** - System architecture
- **[migrations/README.md](./migrations/README.md)** - Database guide

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

## 📄 License

This project is proprietary and confidential.

---

## 🆘 Support

**Issues:**
- Check [Troubleshooting](#troubleshooting)
- Review [SECURITY.md](./SECURITY.md)
- Check Supabase logs

**Contact:**
- Email: dev@tradezone.sg
- GitHub Issues: [Create issue](https://github.com/your-repo/issues)

---

## 🎯 Roadmap

### ✅ Completed (v1.0.0)
- Multi-layer security system
- Cost optimization (60% token reduction)
- Real-time usage monitoring
- Rate limiting & authentication
- Budget controls

### 🚧 In Progress
- Redis-based distributed rate limiting
- Advanced analytics dashboard
- A/B testing framework

### 📋 Planned
- Multi-language chat support
- Sentiment analysis
- Custom training pipeline
- Mobile app integration

---

## 📊 System Status

**Production Status:** ✅ **LIVE**

- Chat System: ✅ Active
- Security: ✅ Enabled
- Analytics: ✅ Real-time
- Monitoring: ✅ Tracking
- Budget Control: ✅ $10/day limit

**Last Updated:** 2025-01-11  
**Version:** 1.0.0  
**Security:** Enabled

---

**Built with ❤️ for TradeZone.sg**

🔒 Secured | 📊 Monitored | 💰 Cost-Optimized
