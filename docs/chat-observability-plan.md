# Chat Observability & Alerting Plan

> Last updated: October 11, 2025

This document outlines how to monitor, debug, and react to issues in the TradeZone chat agent now that structured request and tool telemetry logging are in place.

---

## 1. Data Sources

| Source | Table/API | Purpose |
| --- | --- | --- |
| Request logs | `public.chat_request_logs` | One row per API call (prompt, response, latency, error) |
| Tool runs | `public.chat_tool_runs` | One row per tool invocation (vector, catalog, Perplexity, email) |
| Legacy chat history | `public.chat_logs` | Conversation history surfaced in dashboard |
| Telemetry summaries | `recordAgentTelemetry()` → Supabase | Lightweight stats used by existing dashboard widgets |

---

## 2. Dashboard Enhancements

### 2.1 New Views

1. **Request Timeline (default tab)**  
   - Table with: timestamp, session, source, prompt preview, status, latency badge, tool usage indicator.  
   - “View details” drawer showing full request payload, response, tool summary, and raw JSON for replay.

2. **Tool Performance**  
   - Bar/line charts: success vs. error counts, average latency by tool (`searchProducts`, `searchtool`, `sendemail`).  
   - Top error messages and affected queries.  
   - Filter by date range, source (widget/dashboard), or session.

3. **Error Explorer**  
   - Group by `error_message`, count occurrences, list recent examples with “Re-run in staging” action (auto-populates prompt history in a dev tool).  
   - Provide quick copy trigger to share reproduction steps.

4. **AI Diagnostics (optional)**  
   - Button to run an OpenAI batch summary over the last 50 error logs -> shows categories and suggested fixes; stores summary in `log_insights`.

### 2.2 UI Integration Points

- Extend `/dashboard/logs` with new tabs or a dedicated “Diagnostics” page.  
- Use server components (`react-query` or `SWR`) to fetch `chat_request_logs` / `chat_tool_runs` via new API routes:
  * `GET /api/logs/requests?limit=50&status=error`
  * `GET /api/logs/tools?tool=searchProducts&since=2025-10-10`
  * `POST /api/logs/diagnostics` (trigger AI summary)

---

## 3. Alerting Strategy

### 3.1 Supabase

- Create a Supabase edge function or SQL trigger to watch `chat_request_logs` for:
  * `status = 'error'` rate > 5% in last 10 mins.
  * `latency_ms` > 4000 for 3 consecutive requests.
  * `tool_name` = `searchProducts` with `success = false` more than 5 times in 5 mins.
- On threshold breach, invoke n8n webhook (or email/Slack) with summary.

### 3.2 n8n Workflow (optional once reinstated)

1. **Poller**: every 5 minutes query Supabase for new errors (`select * from chat_request_logs where created_at > now() - interval '5 minutes' and status = 'error'`).  
2. **Branch**: if count > threshold, send Slack/MS Teams alert with top prompts + tool breakdown.  
3. **Auto-ticket** (future): open Linear/Notion task with log excerpts if high severity (e.g., `sendemail` failure).

### 3.3 Health Check

- Extend `/api/chatkit/agent` with `GET` that runs a smoke test (short prompt) and verifies all three layers respond.  
- Schedule uptime monitor (Pingdom/Cronitor) to hit this endpoint every 2 minutes; alert on failure.

---

## 4. Replay & Debug Workflow

1. Locate failing request in dashboard → copy `request_id`.  
2. Call new dev-only endpoint `POST /api/logs/replay` with `request_id` to rerun prompt/history against staging/OpenAI and compare outputs.  
3. If tool failure, jump to `chat_tool_runs` entries with same `request_id` to inspect API errors, args, and latency.  
4. Record root cause and fix in ticketing system; close loop by re-running replay to confirm success.

---

## 5. Next Implementation Steps

1. Build API endpoints for log retrieval (`/api/logs/requests`, `/api/logs/tools`).  
2. Implement dashboard pages (timeline, tool performance, error explorer).  
3. Wire Supabase trigger or edge function for alerting and document configuration.  
4. Optional: add AI diagnostics job + storage table (`log_insights`).  
5. Document SOP in `docs/realtime-troubleshooting.md` linking to this plan.

Once these pieces ship, we will have actionable observability covering user experience, tooling performance, and automated alerts—ready to scale when n8n workflows come back online.
