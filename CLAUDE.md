# Claude Code Analysis - TradeZone Chatbot Dashboard

## Current System Status ✅

### Working Components
- ✅ **Chat Session Management** - n8n sends Guest-XX session IDs, conversations properly grouped
- ✅ **Search Console Integration** - Real data from Supabase with skeleton loaders and caching
- ✅ **Google Analytics 4 API** - Returns real data (sessions, users, pageviews, etc.)
- ✅ **WooCommerce API** - Returns real order data
- ✅ **Dashboard Navigation** - Clean UI with proper routing
- ✅ **Authentication System** - Supabase auth working
- ✅ **Dev Server** - Runs on port 3003

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
- Both tables have proper RLS policies and indexes

### Search Console Tables (Working)  
- `gsc_daily_summary` - Daily aggregated metrics
- `gsc_performance` - Detailed query/page performance data
- Data populated via weekly sync scripts

### Other Core Tables
- `profiles`, `organizations`, `user_organizations` - User management
- Standard Supabase auth tables

## API Endpoints Status

### Chat APIs ✅
- `POST /api/n8n-chat` - Main webhook for n8n chat logs
  - Accepts: user_id, prompt, response, session_id (optional)
  - Auto-session management with 30-minute window
  - Falls back to crypto.randomUUID() for new sessions
- Session grouping works correctly as evidenced by Guest-XX pattern

### Analytics APIs ✅  
- `GET /api/sc/supabase` - Search Console data from Supabase
  - Returns summary, daily data, top queries, top pages
  - Supports pagination, filtering, debug mode
  - Combined performance data for tables
- `GET /api/ga/summary` - Google Analytics 4 summary data

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

## Recent Improvements (Last Commit)
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