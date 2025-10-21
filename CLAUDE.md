# Claude Code Analysis - TradeZone Chatbot Dashboard

## Current System Status ✅

### Working Components
- ✅ **Chat Session Management** - n8n sends Guest-XX session IDs, conversations properly grouped
- ✅ **ChatKit Security System** - Multi-layer protection against spam and API abuse
- ✅ **Trade-In Email Notifications** - Text & voice chat trade-in submissions send emails (FIXED 2025-01-20)
- ✅ **Search Console Integration** - Real data from Supabase with skeleton loaders and caching
- ✅ **Google Analytics 4 API** - Returns real data (sessions, users, pageviews, etc.)
- ✅ **WooCommerce API** - Returns real order data
- ✅ **Dashboard Navigation** - Clean UI with proper routing
- ✅ **Authentication System** - Supabase auth working
- ✅ **Dev Server** - Runs on port 3001/3003

### Session Management (Production Working ✅)
Based on the dashboard screenshot, the session system is working correctly:
- n8n sends meaningful session IDs like `Guest-61`, `Guest-80`, `Guest-99`
- Multiple related messages are properly grouped under the same session
- Dashboard correctly displays grouped conversations
- Session detail pages show full conversation threads

## Current Database Structure (Production)

### Chat Tables (Working)
- `chat_logs` - Individual chat messages with session grouping
- `chat_sessions` - Session metadata and management
- `chat_usage_metrics` - Token usage and cost tracking for ChatKit (NEW)
- `chat_security_events` - Security incident logging (rate limits, auth failures) (NEW)
- All tables have proper RLS policies and indexes

### Search Console Tables (Working)  
- `gsc_daily_summary` - Daily aggregated metrics
- `gsc_performance` - Detailed query/page performance data
- Data populated via weekly sync scripts

### Other Core Tables
- `profiles`, `organizations`, `user_organizations` - User management
- Standard Supabase auth tables

## API Endpoints Status

### Chat APIs ✅
- `POST /api/chatkit/agent` - Main ChatKit endpoint with security (NEW)
  - **Authentication:** Requires X-API-Key header
  - **Rate Limiting:** 20 requests/min per IP, 50 requests/hr per session
  - **Input Validation:** 1-1000 char messages, max 20 history turns
  - **Budget Control:** $10/day default limit
  - **Token Optimization:** Max 800 tokens (60% cost reduction)
  - **Usage Tracking:** All requests logged to chat_usage_metrics
- `POST /api/chatkit/realtime` - Realtime voice chat config (secured)
- `POST /api/n8n-chat` - Legacy n8n webhook (still active)
  - Accepts: user_id, prompt, response, session_id (optional)
  - Auto-session management with 30-minute window
- Session grouping works correctly as evidenced by Guest-XX pattern

### Analytics APIs ✅  
- `GET /api/sc/supabase` - Search Console data from Supabase
  - Returns summary, daily data, top queries, top pages
  - Supports pagination, filtering, debug mode
  - Combined performance data for tables
- `GET /api/ga/summary` - Google Analytics 4 summary data

### Trade-In APIs ✅
- `POST /api/tradein/update` - Update trade-in lead data (brand, model, condition, etc.)
- `POST /api/tradein/submit` - Finalize lead and send email notifications
  - Used by both text and voice chat
  - Sends to: `contactus@tradezone.sg` (BCC: `info@rezult.co`)
  - Subject: `🎮 New Trade-In Request - {lead-id}`
- `POST /api/tradein/media` - Link uploaded images to trade-in leads

### Other APIs ✅
- `GET /api/woocommerce/orders` - WooCommerce order data
- Settings and email reporting endpoints

## Current Architecture

```
n8n Webhook → /api/n8n-chat → Supabase chat_logs
                             ↓
                    Dashboard displays grouped conversations

Weekly Sync → GSC Data → Supabase gsc_* tables → Dashboard analytics

GA4 API → Real-time dashboard metrics
WooCommerce API → Order data display
```

## Development Guidelines

### Working System Principles ✅
1. **n8n Session Management** - n8n maintains session state and sends consistent Guest-XX IDs
2. **30-Minute Session Window** - Server-side fallback for session grouping
3. **Supabase as Source of Truth** - All data flows through Supabase
4. **Real-time UI Updates** - Dashboard shows live data with proper loading states

### Safe Enhancement Approach
- ✅ Current system works correctly
- 🔧 Any changes should be additive, not breaking
- 📊 Add monitoring/logging without changing core logic
- 🧪 Test enhancements on separate branches first

## Environment Setup

### Required Environment Variables
```bash
# Supabase (Core)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Search Console (Working)
SC_SITE=sc-domain:tradezone.sg
GOOGLE_SERVICE_ACCOUNT_KEY=your-service-account-json

# Google Analytics (Working)
GA_PROPERTY=your-ga4-property-id

# WooCommerce (Working) 
WC_SITE=https://your-store.com
WC_KEY=your-consumer-key
WC_SECRET=your-consumer-secret
```

## Key Success Indicators ✅

1. **Session Grouping Working** - Dashboard shows Guest-XX sessions with multiple messages
2. **Analytics Data Flowing** - Real Search Console and GA4 data displayed
3. **Performance Optimized** - Skeleton loaders, caching, pagination working
4. **Database Stable** - All tables exist with proper RLS policies

## Recent Improvements (Latest Commits)

### 2025-01-20: Trade-In Email & Agent Improvements (FINAL FIX)
- **CRITICAL FIX - Email System Fully Working** ✅
  - **Root Cause**: Settings save/load path mismatch for 2+ hours
  - Dashboard saved to: `org.settings.smtp.config`
  - EmailService read from: `org.settings.smtp`
  - **Fix**: Both now use `org.settings.smtp`
  - Unified email system - all flows use same SMTP config:
    * Trade-in submissions (text & voice)
    * Support/contact requests (Singapore-only)
    * Dashboard "Reply via Email" button
    * Test Email button
  - Emails sent to: `contactus@tradezone.sg` (BCC: `info@rezult.co`)
  
- **Agent Enhancements**:
  - Trade-in workflow: Ask for photos BEFORE submission
  - Concise responses, no verbose numbered lists
  - Post-submission image upload: Brief acknowledgment
  - Singapore location verification for support flow
  - Streamlined support email: ask ONCE, send immediately
  - Phone number collection in support requests
  
- **Diagnostic Improvements**:
  - Detailed SMTP error logging (env vars, config state)
  - Settings API logging for troubleshooting
  - Email tool logging for all send attempts
  - Trade-in submission comprehensive logging

### Previous Improvements
- Added per-widget skeleton loaders for better UX
- Enhanced Search Console API with combined performance data
- Improved caching and cache-busting logic
- Fixed online vs local data handling

## Next Steps (Optional Enhancements)
1. **Add Request Logging** - Monitor n8n payload structure without changing logic
2. **Session Analytics** - Track session effectiveness and duration
3. **Enhanced Error Handling** - Better fallbacks for edge cases
4. **Performance Monitoring** - Add metrics for session management

## Support & Troubleshooting

### Session Issues
- Check n8n is sending session_id in webhook payload
- Verify chat_sessions table has active records
- Monitor logs for session creation/reuse patterns

### Email Notification Issues
- **SMTP Settings**: Configure at https://trade.rezult.co/dashboard/settings (Email tab)
- **Check Logs**: Look for `[EmailService]` and `[TradeIn]` in Coolify logs
- **Success Pattern**: 
  ```
  [EmailService] Using SMTP config from database
  [TradeIn] Email sent: true
  ```
- **Failure Pattern**: 
  ```
  [EmailService] SMTP configuration missing
  [TradeIn] Email sent: false
  ```
- **Email Delivery**: Check SMTP2GO dashboard for delivery status
- **Recipients**: All trade-in emails go to `contactus@tradezone.sg` (BCC: `info@rezult.co`)

### Data Issues
- Verify Supabase connection and RLS policies
- Check weekly sync scripts for Search Console data
- Validate environment variables are set correctly

---

**System Status: ✅ PRODUCTION READY**
- Session management: Working correctly
- Data pipelines: Active and populated
- Dashboard: Fully functional with real data
- Architecture: Stable and performant