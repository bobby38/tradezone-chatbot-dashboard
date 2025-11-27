# Coolify Environment Manifest (trade.rezult.co)

- **Last verified:** November 24, 2025
- **Source of truth:** `.env.local` — Coolify’s environment editor should match this file 1:1. Do **not** hand-edit values inside Coolify without updating `.env.local`.
- **Target service:** `tradezone-chatbot-dashboard` on trade.rezult.co (Coolify v4).
- **Backup:** Follow `ENV_BACKUP_INSTRUCTIONS.md` whenever `.env.local` changes.

Values are intentionally omitted here. Reference `.env.local` (encrypted + versioned via your password manager) when populating Coolify.

## Variable Groups

### Supabase Core
- `NEXT_PUBLIC_SUPABASE_URL` *(client-safe)*
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` *(client-safe)*
- `SUPABASE_SERVICE_ROLE_KEY` *(server-only; never expose to browser)*

### AI / LLM Providers
- `NEXT_PUBLIC_OPENAI_API_KEY`
- `OPENAI_API_KEY`
- `OPENAI_VECTOR_STORE_ID`
- `OPENAI_VECTOR_STORE_ID_TRADEIN`
- `NEXT_PUBLIC_OPENROUTER_API_KEY`
- `OPEN_ROUTER_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_GEMINI_API_KEY` / `GEMINI_API_KEY`
- `MISTRAL_API_KEY`
- `GROQ_API_KEY`
- `PERPLEXITY_API_KEY`
- `BRAVE_API_KEY`
- `PERPLEXITY_API_KEY` *(duplicated for legacy code paths — keep both until cleanup)*

### WooCommerce / Catalog
- `WC_SITE`
- `WC_KEY`
- `WC_SECRET`
- `WOOCOMMERCE_PRODUCT_JSON_PATH`
- `WOOCOMMERCE_CONSUMER_KEY`
- `WOOCOMMERCE_CONSUMER_SECRET`
- `WOOCOMMERCE_API_BASE`

### Google Stack
- `GA_PROPERTY`
- `GOOGLE_API_KEY`
- `GOOGLE_APPLICATION_CREDENTIALS`
- `GOOGLE_APPLICATION_CREDENTIALS_JSON` *(only if you switch to inline JSON mode — keep mutually exclusive with file path)*
- `SC_SITE`
- `SEARCH_CONSOLE_SITE`

### SMTP
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM_EMAIL`
- `SMTP_FROM_NAME`

### Storage / File Handling
- `NEXT_PUBLIC_APPWRITE_ENDPOINT`
- `NEXT_PUBLIC_APPWRITE_PROJECT_ID`
- `NEXT_PUBLIC_APPWRITE_BUCKET_ID`
- `APPWRITE_ENDPOINT`
- `APPWRITE_PROJECT_ID`
- `APPWRITE_BUCKET_ID`
- `APPWRITE_API_KEY`

### ChatKit Security Layer
- `CHATKIT_API_KEY`
- `NEXT_PUBLIC_CHATKIT_WIDGET_KEY`
- `CHATKIT_DASHBOARD_KEY`
- `CHATKIT_ALLOWED_ORIGINS`
- `CHATKIT_DAILY_BUDGET`
- `CHATKIT_ALERT_WEBHOOK` *(optional — leave empty if not used)*
- `CHATKIT_DISABLE_AUTH` *(development override; ensure **false** in Coolify)*

### Trade-In Intelligence / Graphiti
- `GRAPHTI_BASE_URL`
- `GRAPHTI_API_KEY`
- `GRAPHTI_DEFAULT_GROUP_ID` *(optional — limits catalog searches to a specific graph group)*

### Additional Tooling
- `N8N_WEBHOOK_BASE`
- `N8N_WEBHOOK_TOKEN`
- `GOOGLE_SERVICE_ACCOUNT_KEY` *(legacy name used by scripts — keep synced with GA credentials)*

## Sync Procedure
1. Update `.env.local` locally (commit hash noted in `FINAL_DEPLOYMENT_SUMMARY.md`).
2. Run `pbpaste < .env.local` (or your editor) → paste into Coolify’s bulk editor.
3. Hit **Save**, then trigger a redeploy.
4. Log the sync date + git commit in `FINAL_DEPLOYMENT_SUMMARY.md`.

This manifest is your checklist before touching Coolify so we never drift from the deterministic trade-in behavior tied to these keys.
