# Supabase Performance/Security Lint Report — Nov 24, 2025

- **Source file**: `Supabase Performance Security Lints.csv` (exported from Supabase dashboard)
- **Context**: trade.rezult.co production project (Supabase `jvkmxtbckpfwypnbubdy`)
- **Focus**: Performance regressions tied to RLS policies + duplicate indexes without breaking deterministic trade-in workflows
- **Live snapshot tooling**: After applying `supabase/migrations/20251124_supabase_introspection.sql`, run `tsx scripts/export-supabase-lint-data.ts` to pull current policies/indexes into `docs/supabase-*-latest.json` before making changes.

## Auth RLS Initialization Plan
Wrap expensive `auth.*` calls into subqueries so they evaluate once per statement instead of per-row.

- `users`: Table \`public.users\` has a row level security policy \`Users can see their own row\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
- `users`: Table \`public.users\` has a row level security policy \`Insert own user row\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
- `chat_logs`: Table \`public.chat_logs\` has a row level security policy \`Clients see their own logs\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
- `prompts`: Table \`public.prompts\` has a row level security policy \`Admins manage prompts\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
- `chat_logs`: Table \`public.chat_logs\` has a row level security policy \`admins see all\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
- `form_submissions`: Table \`public.form_submissions\` has a row level security policy \`Allow authenticated users to view form submissions\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
- `settings`: Table \`public.settings\` has a row level security policy \`Allow authenticated users to manage settings\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
- `trade_in_leads`: Table \`public.trade_in_leads\` has a row level security policy \`trade_in_leads_service_access\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
- `trade_in_media`: Table \`public.trade_in_media\` has a row level security policy \`trade_in_media_service_access\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
- `trade_in_actions`: Table \`public.trade_in_actions\` has a row level security policy \`trade_in_actions_service_access\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.
- `trade_in_tags`: Table \`public.trade_in_tags\` has a row level security policy \`trade_in_tags_service_access\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.

## Multiple Permissive Policies
Merge overlapping permissive policies per role/action to avoid redundant evals and confusing access control.

- `chat_logs`: Table \`public.chat_logs\` has multiple permissive policies for role \`anon\` for action \`SELECT\`. Policies include \`{"Clients see their own logs","admins see all"}\`
- `chat_logs`: Table \`public.chat_logs\` has multiple permissive policies for role \`authenticated\` for action \`SELECT\`. Policies include \`{"Clients see their own logs","admins see all"}\`
- `chat_logs`: Table \`public.chat_logs\` has multiple permissive policies for role \`authenticator\` for action \`SELECT\`. Policies include \`{"Clients see their own logs","admins see all"}\`
- `chat_logs`: Table \`public.chat_logs\` has multiple permissive policies for role \`dashboard_user\` for action \`SELECT\`. Policies include \`{"Clients see their own logs","admins see all"}\`
- `form_submissions`: Table \`public.form_submissions\` has multiple permissive policies for role \`authenticated\` for action \`SELECT\`. Policies include \`{"Allow authenticated users to read form submissions","Allow authenticated users to view form submissions"}\`
- `prompts`: Table \`public.prompts\` has multiple permissive policies for role \`authenticated\` for action \`SELECT\`. Policies include \`{"Admins manage prompts","Read prompts"}\`
- `settings`: Table \`public.settings\` has multiple permissive policies for role \`authenticated\` for action \`SELECT\`. Policies include \`{"Allow authenticated users to manage settings","Allow authenticated users to read settings"}\`
- `settings`: Table \`public.settings\` has multiple permissive policies for role \`authenticated\` for action \`UPDATE\`. Policies include \`{"Allow authenticated users to manage settings","Allow authenticated users to update settings"}\`

## Duplicate Indexes
Drop redundant indexes to keep writes fast and vacuum simple.

- `chat_logs`: Table \`public.chat_logs\` has identical indexes {chat_logs_created_idx,idx_chat_logs_created_at}. Drop all except one of them (indexes: chat_logs_created_idx, idx_chat_logs_created_at)
- `chat_logs`: Table \`public.chat_logs\` has identical indexes {chat_logs_session_idx,idx_chat_logs_session_id}. Drop all except one of them (indexes: chat_logs_session_idx, idx_chat_logs_session_id)
- `chat_logs`: Table \`public.chat_logs\` has identical indexes {chat_logs_user_idx,idx_chat_logs_user_id}. Drop all except one of them (indexes: chat_logs_user_idx, idx_chat_logs_user_id)
- `form_submissions`: Table \`public.form_submissions\` has identical indexes {form_submissions_form_type_idx,idx_form_submissions_form_type}. Drop all except one of them (indexes: form_submissions_form_type_idx, idx_form_submissions_form_type)
- `form_submissions`: Table \`public.form_submissions\` has identical indexes {form_submissions_status_idx,idx_form_submissions_status}. Drop all except one of them (indexes: form_submissions_status_idx, idx_form_submissions_status)
- `settings`: Table \`public.settings\` has identical indexes {idx_settings_unique,settings_user_id_setting_type_setting_key_key}. Drop all except one of them (indexes: idx_settings_unique, settings_user_id_setting_type_setting_key_key)

## Immediate Remediation Plan
1. Update RLS policies listed above to wrap `auth.*` calls with `(select auth.*(...))` per Supabase guidance. Run through staging DB before production to avoid policy downtime.
2. Consolidate redundant permissive policies by merging logic into a single policy per (role, action) pair, reusing existing check expressions.
3. Drop duplicate indexes after confirming no unique constraints rely on them: `chat_logs`, `form_submissions`, `settings`. Keep one canonical index per column set.
4. Re-run Supabase lint after changes and document verification in `FINAL_DEPLOYMENT_SUMMARY.md`.
