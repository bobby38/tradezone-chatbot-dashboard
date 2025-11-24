# Supabase Query Performance Notes — Nov 24, 2025

Source: `Supabase Query Performance Statements.csv` (dashboard export). Focused on `public.gsc_performance` because it drives the GA/Search Console panels.

## Top Statements

1. **Read (service_role)** — 604 calls, 68.9 ms mean / 679 ms max
   - `select ... from public.gsc_performance where site = any($1) and date between $2 and $3 order by clicks desc limit $5 offset $6`
   - Uses composite filters on `site,date,page,query,country,device` plus `ORDER BY clicks`.
2. **Write (anon via webhook)** — 8 calls, 1.99 s mean / 2.78 s max
   - JSON upsert with `ON CONFLICT (site,date,page,query,country,device)` then full-row update.
   - `ROWS_READ=8` (entire upsert payload), 100% buffer cache hit.
3. **Secondary read (anon)** — 110 calls, 97.8 ms mean / 655 ms max
   - Similar to #1 but invoked under the anon key (likely dashboard filters or cron jobs).
4. **Aggregated read (service_role)** — 604 calls, 7.8 ms mean / 83.9 ms max
   - Summaries by `site/page/query` for the “Top Pages/Queries” cards.

## Immediate Optimizations (no behavior change)

- **Index coverage:** create a multicolumn index on `(site, date, clicks desc)` with included columns (`page, query, country, device, impressions, ctr, position) to support the ordered read. Existing primary key already covers the ON CONFLICT set; verify via `pg_indexes` before adding duplicates.
- **Batch ingestion:** the webhook currently upserts row-by-row. Update the ingest script to bundle daily exports into ≤500-row chunks or use Supabase's `COPY` endpoint to reduce per-call overhead.
- **Connection roles:** the heavy read is under `service_role`. Move dashboard queries to the `authenticator` role with RLS that only exposes the needed columns—keeps the service key out of PostgREST and lets us tune per-role limits.
- **Cache shared lookups:** the same GA panel parameters trigger multiple identical reads. Add a server-side cache around `/api/gsc/*` responses (24h TTL) to avoid hammering Supabase for static historical ranges.

## Follow-up

- Re-run the Supabase “Query Performance Statements” after applying the index + batching changes and log the deltas here.
- Tie these items into `PERFORMANCE_OPTIMIZATION_PLAN.md` under the GA/Search Console section so they’re tracked alongside the chatbot optimizations.
