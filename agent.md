# TradeZone Chatbot Dashboard — Agent Brief

## 1. Project Snapshot
- **Stack**: Next.js 14 (App Router) + React 18 + TypeScript, Tailwind, Supabase (Postgres + Auth), Recharts, nodemailer, GA4 API, WooCommerce REST.
- **Top-level modules** (`app/`): auth/login, dashboard shell, analytics (chat + GA + Woo), chat logs, submissions, emails, insights, WooCommerce, Google Analytics, session detail pages.
- **Key services**: Supabase database/auth, Google Analytics 4, Search Console (synced into Supabase), WooCommerce API, n8n webhooks, SMTP/SMTP2GO, OpenAI/OpenRouter for AI insights.
- **Latest documented status**: Phase 1 shipped; Phase 2 deployment checklist in progress as of August 25, 2025 (see `plan.md`).

## 2. Environment & Secrets
Configure the following before running locally or deploying (see `plan.md` and `.sql` docs for context):
1. **Supabase**
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (required for server routes like notifications)
   - *Optional dev flag*: `NEXT_PUBLIC_BYPASS_AUTH=true` to skip auth checks in `app/dashboard/layout.tsx:16-37`.
2. **AI providers**
   - `OPENAI_API_KEY` or `NEXT_PUBLIC_OPENAI_API_KEY`
   - Alternatively `NEXT_PUBLIC_OPENROUTER_API_KEY` (used in `components/data-chatbot.tsx` and `lib/ai-analytics.ts`).
3. **Google Analytics/Search Console**
   - `GA_PROPERTY`
   - `GOOGLE_SERVICE_ACCOUNT_KEY` (JSON or base64) or `GOOGLE_APPLICATION_CREDENTIALS` path; required by `app/api/ga/*` handlers.
   - `SC_SITE`, optional OAuth fallback envs for sync scripts.
4. **n8n / notifications**
   - `N8N_WEBHOOK_BASE`, `N8N_WEBHOOK_TOKEN` (referenced in `docs/notification-system.md`).
5. **SMTP**
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME` (fallbacks used in `lib/email-service.ts:63-74`).
6. **WooCommerce**
   - `WC_SITE`, `WC_KEY`, `WC_SECRET` for `/api/woocommerce` routes.
7. **Misc**
   - `GOOGLE_SERVICE_ACCOUNT_KEY` also powers Search Console sync scripts in `scripts/`.

Keep service-role secrets server-side only; do **not** expose `SUPABASE_SERVICE_ROLE_KEY` to the browser. Several API routes still instantiate Supabase with `NEXT_PUBLIC_SUPABASE_ANON_KEY`; harden them during fixes (see §6).

## 3. Database & Migrations
Supabase schema lives in SQL files under `/supabase/migrations/` plus root helper scripts. Apply in production (Phase 2 checklist, `plan.md`). Core tables:
- `chat_logs`, `chat_sessions`, `session_summaries` (from `enhance-chat-sessions.sql`) for conversation history.
- `submissions`, `submission_drafts` (`create_submissions_table.sql`, `supabase/migrations/20250825_submission_drafts.sql`) for form + AI reply workflows.
- `extracted_emails` (`supabase/migrations/20250825_extracted_emails.sql`) for email intelligence.
- `settings` (`20250824_create_settings_table.sql`) for configurable integrations.
- `form_submissions` (`20250824_create_form_submissions.sql`) and supporting Fluent Forms triggers.
- `wc_snapshots` (`create-wc-snapshots.sql`) for WooCommerce rollups.
- `gsc_*` tables and functions (`20250809_gsc_tables.sql`, `20250810_gsc_rpc_functions*.sql`) for Search Console ingestion.
Apply helper scripts in `/scripts`:
- `create-required-tables.js`, `create-webhook-rls-policy.js`, `apply-supabase-migration.js`.
- Search Console sync pipeline via `run-sc-sync.sh`, `weekly-sc-sync.sh`, and Launchd plist.

## 4. API Surface (App Router routes)
- **Chat ingestion**: `app/api/n8n-chat/route.ts` handles POST webhooks and GET health checks. Requires Supabase triggers and should use a server-side client key (currently uses the public key at lines 4-6).
- **Session utilities**: `app/api/chat-sessions/route.ts` offers manual session management.
- **Form/webhook**: `app/api/webhook/fluent-forms/route.ts` ingests Fluent Forms, creates submissions, fires notifications/email.
- **Submissions management**: `/api/submissions` CRUD + `/api/submissions/stats`, `/api/submissions/[id]` for detail/update.
- **AI/email**: `/api/extract-emails`, `/api/test-email`, `/api/schedule-email-report`.
- **Analytics**:
  - Google Analytics endpoints `/api/ga/*` use `BetaAnalyticsDataClient` and caching (see `app/api/ga/summary/route.ts`).
  - Search Console endpoints `/api/sc/*` provide daily, summary, queries, devices, pages, countries, Supabase-backed aggregator.
- **WooCommerce**: `/api/woocommerce` and `/api/woocommerce/orders` wrap `@woocommerce/woocommerce-rest-api`.
- **Notifications**: `/api/notifications` (+ child routes) read/write to `notifications` table with service-role fallback mocks.
- **Settings**: `/api/settings`, `/api/settings-simple` manage persisted settings.
- **Insights**: `/api/insights` composes AI summaries of chat + analytics data.
- **Utility/testing**: `/api/test-webhook` quick echo endpoint.

## 5. Frontend Modules & Key Behaviours
- **Auth & Layout**
  - `AuthProvider` in `lib/auth.tsx:16-55` wraps Supabase password sign-in flows (contrasts with original spec calling for magic-link; see Task A below).
  - `app/dashboard/layout.tsx:16-37` enforces auth, with optional `NEXT_PUBLIC_BYPASS_AUTH` bypass for local dev.
- **Dashboard overview** (`app/dashboard/page.tsx`)
  - Aggregates chat, submission, GA/SC, WooCommerce stats via Supabase and API routes.
  - `setStats` currently leaves `totalTokens` and `avgSessionDuration` as random placeholders (`Math.random()` at lines 194-195); replace with real metrics from Supabase tables or analytics sources.
- **Chat Logs** (`app/dashboard/logs/page.tsx`) supports search, filters, pagination, CSV export via `exportToCSV` util.
- **Session detail pages** (`app/dashboard/sessions/[id]/page.tsx`) rely on `session_summaries`/`chat_logs` tables.
- **Form Submissions** (`app/dashboard/submissions/page.tsx`) handles tabbed views, filters, bulk actions, AI-generated drafts.
- **Email Extraction** (`app/dashboard/emails/page.tsx`) surfaces `extracted_emails` output and classification.
- **AI Insights & Analytics** (`app/dashboard/insights/page.tsx`, `app/dashboard/analytics/page.tsx`) coordinate with `components/ai-analytics.tsx`, `components/data-chatbot.tsx` to call OpenAI/OpenRouter; they depend on env keys and real data arrays.
- **WooCommerce** dashboards use `/api/woocommerce` results and `components/woocommerce-dashboard.tsx` for charts.
- **Google Analytics page** relies on `/api/ga/*` plus Search Console combos.
- **Notification Center** (`components/notification-center.tsx`) polls `/api/notifications` every 30s and expects real tables once migrations applied.
- **Sidebar Navigation** organizes categories and integrates Notification center + user menu.

## 6. Required Fixes / Hardening Priorities
1. **Authentication parity**
   - Original spec (`tradezone.md`) expects magic-link auth; current UX uses password login (`app/login/page.tsx:10-83`, `lib/auth.tsx:38-48`). Decide whether to restore magic-link flow or update spec/plan accordingly.
2. **Secure Supabase usage**
   - Replace public anon keys with service role for server-side mutations.
   - Critical endpoints: `app/api/n8n-chat/route.ts:4-106`, `/api/notifications` handlers, `/api/submissions` (verify usage), email extraction, etc. Ensure RLS + service role alignment.
3. **Remove placeholder analytics**
   - Implement `totalTokens` and `avgSessionDuration` using actual data (e.g., aggregate `chat_logs.tokens_used` once captured or compute from `session_summaries`), replacing placeholders in `app/dashboard/page.tsx:187-207`.
4. **Data source availability checks**
   - Many APIs fall back to mocks when tables missing (e.g., `app/api/notifications/route.ts:61-107`). After migrations, enforce table checks and surface actionable errors/logging.
5. **Error handling and observability**
   - Add structured logging/alerting for API failures (GA, SC, WooCommerce). Instrument new telemetry once deployment ready (Phase 3 requirement in `plan.md`).
6. **Settings persistence**
   - Verify `lib/settings.ts` / `lib/server-settings.ts` interplay ensures secrets stored securely server-side.
7. **Deployment readiness**
   - Execute Phase 2 checklist (`plan.md`): configure Coolify env vars, run migrations, validate RLS.
   - Confirm production build handles missing optional env gracefully (recent fix noted in plan).
8. **AI provider UX**
   - `components/data-chatbot.tsx` warns when no API key; consider gating UI or prompting for config.
9. **n8n Webhook resilience**
   - Add rate limiting/api key validation on `/api/n8n-chat` and logging of payload structure per recommendations in `CLAUDE.md`.
10. **Accessibility & responsiveness**
    - Refer to `tests/ui-analysis.spec.js` for viewport coverage; address any flagged nav overflow (Playwright logs). Consider adding assertions instead of console outputs.

## 7. Feature Backlog (from docs & code)
- **Phase 2 (High Priority)** — deployment tasks, production verification, migrations (see `plan.md`).
- **Phase 3 (Medium)** — n8n automation expansion, AI enhancements (sentiment, summarization, predictive analytics).
- **Phase 4-6 (Low)** — inventory/operations management, mobile app, marketplace integrations (`CLIENT_FEATURES_OVERVIEW.md`).
- **Notification system** — follow detailed blueprint in `docs/notification-system.md` to wire n8n webhooks, priority routing, Telegram/WhatsApp actions.
- **Session analytics** — implement metrics called out in `CLAUDE.md` next steps (request logging, performance monitoring).
- **Trade-in workflow automation** — refine queue/priority-based notifications (Docs + plan).
- **GitHub export / tenant theming** — reserved hooks mentioned in `tradezone.md` growth section.

## 8. Operations & Tooling
- **Search Console Sync**: Run `scripts/run-sc-sync.sh` weekly; maintain Launchd plist `scripts/com.tradezone.sc-weekly.plist`.
- **Supabase migrations**: use `scripts/apply-supabase-migration.js` for ordered execution.
- **Testing**: Playwright spec (`tests/ui-analysis.spec.js`) generates viewport screenshots and layout diagnostics. Augment with assertions and CI integration.
- **Deployment**: Target Coolify + Docker per `plan.md`, ensure env secrets, run `npm run build` (Next 14) with Node ≥18.
- **Monitoring**: Phase 3 backlog includes observability; consider introducing Sentry/Logflare, Cron triggers for health checks, GA quota alarms.

## 9. Reference Assets
- Visual design references: `dashboard-full-analysis.png`, `dashboard-new-sidebar-*.png`.
- Integration guides: `n8n-integration-guide.md`, `woocommerce-setup-guide.md`, `SEARCH_CONSOLE_SYNC.md`.
- Legacy specs & analyses: `tradezone.md`, `CLIENT_FEATURES_OVERVIEW.md`, `CLAUDE.md`, `plan.md`.
- SQL artifacts: root `.sql` files + `/supabase/migrations/` for full schema.

## 10. Immediate Next Steps for Agent
1. Verify environment configuration per §2; load secrets locally.
2. Apply Supabase migrations + triggers; seed test data as needed.
3. Harden server routes to use service-role keys securely, align auth method with product spec, and replace dashboard placeholders with real analytics.
4. Execute Phase 2 deployment checklist (Coolify envs, production verification) and document outcomes in `plan.md` or new status log.
5. Implement notification integrations and AI enhancements per backlog priorities once production parity achieved.

Keep this brief updated as deliverables land; append change log entries at the end with timestamp + summary.

---

## 11. OpenAI AgentKit Integration (Phase 2.5 - Deployed October 2025)

### Architecture Overview
The TradeZone chatbot now uses **OpenAI's complete ecosystem** for voice, text, and vision capabilities:

```
User → /dashboard/chat (ChatKit UI)
         ↓
    /api/chatkit/agent (Text) → OpenAI Chat Completions + Function Calling
         ↓
    /api/chatkit/realtime (Voice) → OpenAI Realtime API
         ↓
    Supabase chat_logs (Same logging as n8n)
```

### Core Components

#### 1. Agent Tools Library (`lib/tools/`)
Three main tools available to the AI agent:

**Vector Search** (`vectorSearch.ts`)
- Searches Docling hybrid chunk vector store (`vs_68e89cf979e88191bb8b4882caadbc0d`)
- Uses OpenAI Responses API with `file_search` tool
- Primary tool for product information and TradeZone knowledge

**Perplexity Search** (`perplexitySearch.ts`)
- Web search on tradezone.sg domain
- Uses Perplexity Sonar Pro model
- Fallback when vector search doesn't have current info

**Email Send** (`emailSend.ts`)
- Handles trade-in requests and customer inquiries
- Creates submissions in Supabase
- Sends notification emails via existing SMTP service
- Only used when customer explicitly requests contact

#### 2. ChatKit Agent API (`/api/chatkit/agent`)
**Endpoint**: `POST /api/chatkit/agent`

**Features**:
- Uses OpenAI Chat Completions with function calling
- Loads admin-configurable settings from Supabase (`organizations.settings.chatkit`)
- Supports conversation history for context
- Logs all interactions to `chat_logs` table (preserves Guest-XX session pattern)
- Full Izacc personality prompt included

**Configuration** (from Supabase settings):
```javascript
{
  chatkit: {
    textModel: "gpt-4o-mini",  // or gpt-4o, gpt-4.1-mini, etc.
    systemPrompt: "..."        // Full Izacc prompt
  }
}
```

**Request Format**:
```json
{
  "message": "Do you have PlayStation 5 in stock?",
  "sessionId": "Guest-1234",
  "history": [
    { "role": "user", "content": "Hi" },
    { "role": "assistant", "content": "Hi! I'm Izacc..." }
  ]
}
```

**Response Format**:
```json
{
  "response": "Let me check our inventory for you...",
  "sessionId": "Guest-1234",
  "model": "gpt-4o-mini"
}
```

#### 3. Realtime Voice API (`/api/chatkit/realtime`)
**Endpoint**: `POST /api/chatkit/realtime`

**Features**:
- Configures OpenAI Realtime API for voice conversations
- Uses `gpt-realtime-mini` by default (cost-effective)
- Returns WebSocket connection details and configuration
- Supports voice selection (alloy, echo, fable, onyx, nova, shimmer)

**Configuration** (from Supabase settings):
```javascript
{
  chatkit: {
    voiceModel: "gpt-realtime-mini",  // or gpt-4o-realtime-preview
    voice: "alloy"                     // Voice selection
  }
}
```

**Available Models**:
- `gpt-realtime-mini` ⭐ (recommended, cost-effective)
- `gpt-4o-realtime-preview`
- `gpt-4o-mini-realtime-preview`

**Response Format**:
```json
{
  "success": true,
  "config": {
    "model": "gpt-realtime-mini",
    "voice": "alloy",
    "websocketUrl": "wss://api.openai.com/v1/realtime",
    "apiKey": "sk-proj-...",
    "instructions": "You are Izacc...",
    "turnDetection": { "type": "server_vad", ... }
  }
}
```

#### 4. Chat UI (`/dashboard/chat`)
**Features**:
- Hero welcome card with autoplay TradeZone avatar video and spotlight widgets for quick tips/promotions
- Text chat interface with message history
- Voice call button (START A CALL)
- File upload support (coming soon)
- Session management with Guest-XX pattern
- Auto-scrolling message display
- Loading states and error handling
- Mobile responsive design

**User Flow**:
1. User visits `/dashboard/chat`
2. Session ID generated (Guest-XXXX)
3. Choose text or voice mode
4. Text: Type messages, get AI responses
5. Voice: Click "Start A Call", speak naturally
6. All interactions logged to Supabase

### Environment Variables
```env
# OpenAI Configuration
OPENAI_API_KEY=sk-proj-...
OPENAI_VECTOR_STORE_ID=vs_68e89cf979e88191bb8b4882caadbc0d

# Optional: Perplexity for web search
PERPLEXITY_API_KEY=...
```

### Admin-Configurable Settings
Admins can configure via Supabase `organizations.settings` JSONB field:

```json
{
  "chatkit": {
    "textModel": "gpt-4o-mini",
    "voiceModel": "gpt-realtime-mini",
    "voice": "alloy",
    "systemPrompt": "IMPORTANT: Do NOT include [USER_INPUT...]..."
  }
}
```

**Note**: The dashboard Settings screen now includes dedicated tabs (General, AI Models, Email, Bot Settings, Bot Logs). ChatKit prompt/model/voice can be edited there; the API falls back to default values if Supabase settings are unavailable so the chat page always loads.

### Migration from n8n

**Hybrid Approach** (Current):
- Both n8n and ChatKit can coexist
- Both log to same `chat_logs` table
- Same session management (Guest-XX pattern)
- ChatKit used for new chat page
- n8n continues for existing webhooks

**Migration Path**:
1. **Phase 1** (Current): ChatKit available at `/dashboard/chat`, n8n continues
2. **Phase 2**: Gradual user migration to ChatKit
3. **Phase 3**: Deprecate n8n workflow once fully validated

### Tool Execution Flow
```
User: "Do you have gaming keyboards?"
  ↓
Agent receives message
  ↓
Calls searchProducts tool → Vector search
  ↓
Vector store returns product info
  ↓
Agent synthesizes response with links
  ↓
User receives: "Yes! We have [Razer BlackWidow...]"
```

### Logging & Analytics
All ChatKit interactions are logged to `chat_logs`:
```sql
INSERT INTO chat_logs (
  session_id,      -- "Guest-1234"
  prompt,          -- User message
  response,        -- AI response
  source,          -- "chatkit"
  user_id,         -- Session ID
  status,          -- "success"
  created_at,      -- Timestamp
  session_name     -- First 50 chars of prompt
)
```

This preserves compatibility with existing dashboard analytics and chat logs page.

- Additional in-memory agent telemetry is recorded via `lib/chatkit/telemetry.ts` and surfaced at `GET /api/chatkit/telemetry`. The dashboard Settings → **Bot Logs** tab consumes this endpoint to show tool usage (vector store, Perplexity, email) for the most recent conversations.

- `/api/settings` now returns sensible defaults (model, prompt, voice, vector store ID) when Supabase configuration is missing, preventing 500s in production while still persisting updates through Supabase when available.

### Benefits
- ✅ **Single OpenAI Integration**: No ElevenLabs, unified billing
- ✅ **Cost-Effective Voice**: gpt-realtime-mini vs premium alternatives
- ✅ **Modern UI**: Clean chat interface in dashboard
- ✅ **Multimodal Ready**: Text, voice, vision (file upload coming soon)
- ✅ **Admin Configurable**: Models and prompts via database settings
- ✅ **Existing Compatibility**: Same logging, same session patterns
- ✅ **n8n Coexistence**: Gradual migration, no breaking changes

### Rollback Plan
All changes isolated in feature branch: `feature/openai-agentkit`

To rollback:
```bash
git checkout main
git branch -D feature/openai-agentkit
```

### Future Enhancements
1. **Settings Page UI**: Add ChatKit configuration card to `/dashboard/settings`
2. **File Upload**: Enable image/document uploads for vision capabilities
3. **WebSocket Implementation**: Full WebRTC voice calling in browser
4. **Analytics**: Track ChatKit-specific metrics (voice vs text usage)
5. **A/B Testing**: Compare ChatKit vs n8n performance

### File Structure
```
app/
├── api/
│   └── chatkit/
│       ├── agent/route.ts        # Text chat API
│       └── realtime/route.ts     # Voice API
└── dashboard/
    └── chat/page.tsx             # Chat UI

lib/
└── tools/
    ├── vectorSearch.ts           # Docling vector store
    ├── perplexitySearch.ts       # Web search
    ├── emailSend.ts              # Trade-ins/inquiries
    └── index.ts                  # Tool exports
```

---

## Change Log

### October 10, 2025 - OpenAI Realtime Voice Integration
**Branch**: `feature/openai-agentkit`

#### **✅ Completed Features**

**1. OpenAI Realtime Voice Chat** (`components/realtime-voice.tsx`)
- **WebSocket audio streaming** using OpenAI Realtime API (`wss://api.openai.com/v1/realtime`)
- **Model**: `gpt-4o-realtime-preview` (configurable via admin settings)
- **Voice**: `alloy` (configurable: alloy, echo, fable, onyx, nova, shimmer)
- **Real-time transcription** with Whisper-1 model
- **Server-side VAD** (Voice Activity Detection) for natural conversation flow
- **Microphone capture** with echo cancellation and noise suppression
- **Live transcript display** in chat UI

**2. Intelligent Search System**
- **Vector Store Search First**: Queries Docling hybrid chunk vector store (`vs_68e89cf979e88191bb8b4882caadbc0d`)
- **Perplexity Fallback**: Uses web search only if vector store returns no useful results
- **Smart Detection**: Validates result quality (length > 50 chars, no error messages)
- **Source Tracking**: Logs whether answer came from vector_store or perplexity

**Search Flow**:
```
User Query → searchtool called
           ↓
    STEP 1: handleVectorSearch()
           → OpenAI Responses API with file_search
           → Docling vector store (product catalog)
           ↓
    Result useful? (length > 50, no errors)
           ↓
    YES → Return vector store answer ✅
           ↓
    NO → STEP 2: handlePerplexitySearch()
         → Perplexity Sonar Pro
         → Web search focused on tradezone.sg
         ↓
         Return web search result 🌐
```

**3. Agent Tools** (`/lib/tools/`)
- **`vectorSearch.ts`**: Searches Docling vector store via OpenAI Responses API
- **`perplexitySearch.ts`**: Web search fallback using Perplexity Sonar Pro
- **`emailSend.ts`**: Customer inquiry submission (trade-ins, info requests, contact)
- **`index.ts`**: Exports tool definitions and handler functions

**4. API Endpoints**
- **`/api/chatkit/agent`**: Text chat with function calling (OpenAI Chat Completions)
- **`/api/chatkit/realtime`**: Voice session configuration (returns WebSocket config)
- **`/api/tools/perplexity`**: Hybrid search endpoint (vector → web fallback)
- **`/api/tools/email`**: Email submission handler

**5. Chat UI** (`/app/dashboard/chat/page.tsx`)
- **Dual Mode**: Text chat + Voice chat with easy switching
- **Text Mode**: Message history, input field, tool call execution
- **Voice Mode**: RealtimeVoice component with live transcripts
- **Session Management**: Guest-XXXX pattern for session tracking
- **Welcome UI**: Product showcase with mode selection

**6. Admin Configuration** (via Supabase `organizations.settings.chatkit`)
```typescript
{
  chatkit: {
    voiceModel: "gpt-4o-realtime-preview",
    voice: "alloy",
    systemPrompt: "Custom instructions...",
    textModel: "gpt-4o-mini",
    temperature: 0.7
  }
}
```

#### **🔧 Technical Implementation**

**Environment Variables Required**:
```env
OPENAI_API_KEY=sk-proj-...
OPENAI_VECTOR_STORE_ID=vs_68e89cf979e88191bb8b4882caadbc0d
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
PERPLEXITY_API_KEY=...
```

**Realtime API Session Configuration**:
```typescript
{
  type: "session.update",
  session: {
    type: "response",  // Required by API
    model: "gpt-4o-realtime-preview",
    modalities: ["text", "audio"],
    voice: "alloy",
    input_audio_format: "pcm16",
    output_audio_format: "pcm16",
    input_audio_transcription: { model: "whisper-1" },
    turn_detection: {
      type: "server_vad",
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 500
    },
    tools: [
      { type: "function", name: "searchtool", ... },
      { type: "function", name: "sendemail", ... }
    ],
    tool_choice: "auto"
  }
}
```

**Key Fixes Applied**:
- ✅ Added `session.type = "response"` (required parameter)
- ✅ Removed `file_search` tool (not supported in Realtime API)
- ✅ Implemented vector search in backend instead
- ✅ Fixed TypeScript exports in `lib/tools/index.ts`
- ✅ Corrected OpenAI message format for tool calls
- ✅ Added proper error handling and logging

#### **📊 Data Flow**

**Voice Conversation**:
```
User speaks → Microphone → PCM16 encoding
           ↓
    WebSocket → OpenAI Realtime API
           ↓
    Whisper transcription (user speech)
           ↓
    AI processes → Calls tools if needed
           ↓
    searchtool → Vector DB → Perplexity (if needed)
           ↓
    AI generates response
           ↓
    Audio response + transcript → User hears answer
           ↓
    Logs to chat_logs table (Supabase)
```

**Text Conversation**:
```
User message → /api/chatkit/agent
           ↓
    OpenAI Chat Completions with tools
           ↓
    Function calls executed (vector search, etc.)
           ↓
    Response returned → UI
           ↓
    Logs to chat_logs table (Supabase)
```

#### **🚀 Deployment Notes**

**Current Status**:
- ✅ All features implemented and committed
- ✅ Vector store integration working
- ⚠️ Voice chat tested (session config fixed, awaiting final validation)
- ⚠️ Text chat working with tool calls
- 🔜 Production deployment to tradezone.sg pending

**Pre-Deployment Checklist**:
1. ✅ Verify all environment variables in production
2. ⚠️ Test end-to-end voice conversation
3. ⚠️ Test vector store search accuracy
4. ⚠️ Validate Perplexity fallback triggers correctly
5. ⚠️ Test email submission from voice chat
6. 🔜 Implement ephemeral tokens (security - don't expose API key to client)
7. 🔜 Add rate limiting on API endpoints
8. 🔜 Configure CORS for production domain
9. 🔜 Add monitoring/logging for tool calls
10. 🔜 Create admin UI for ChatKit settings

**Git Commits** (feature/openai-agentkit):
- `c40155b` - fix(tools): correct TypeScript imports and type definitions
- `a59bf6f` - fix(agent): correct OpenAI message format for tool calls
- `87843c6` - fix(agent): simplify message format to avoid OpenAI API errors
- `3e71c3e` - fix(agent): correct string literal syntax error
- `33eb3d3` - feat(voice): implement OpenAI Realtime voice with vector store integration
- `3e98cc4` - fix(voice): add session.type and remove file_search tool
- `d0f2002` - feat(voice): integrate vector store search with Perplexity fallback
- `c42f22d` - fix(voice): correct Realtime API session.update format
- `2e67cf4` - fix(voice): add session.type parameter to session.update

#### **🎯 Next Steps**

**For Testing**:
1. Start dev server: `npm run dev`
2. Navigate to: http://localhost:3001/dashboard/chat
3. Test text chat with product queries
4. Click "VOICE CHAT" and allow microphone
5. Speak naturally: "What gaming headsets do you have?"
6. Verify vector store search executes first
7. Test fallback with queries not in catalog

**For Production (tradezone.sg)**:
1. Merge `feature/openai-agentkit` → `main` after validation
2. Deploy to production with environment variables
3. Options for website integration:
   - **Option A**: iframe `/dashboard/chat` on tradezone.sg
   - **Option B**: Extract `RealtimeVoice` as standalone widget
   - **Option C**: Add voice button to existing chat widget
4. Implement security hardening (ephemeral tokens, rate limits)
5. Add analytics tracking for voice usage
6. Monitor costs (Realtime API + vector store + Perplexity)

**Modified**:
- ✅ Sidebar navigation (added Chat menu item)
- ✅ Environment configuration (.env.local)
- ✅ Tool exports and handlers
- ✅ API route structure

**Status**: ✅ Implementation complete, awaiting final voice validation and production deployment
