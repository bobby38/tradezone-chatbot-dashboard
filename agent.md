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
