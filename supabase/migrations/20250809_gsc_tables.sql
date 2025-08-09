-- Google Search Console tables for Supabase
create table if not exists public.gsc_daily_summary (
  site text not null,
  date date not null,
  clicks integer not null,
  impressions integer not null,
  ctr numeric not null,
  position numeric not null,
  primary key (site, date)
);

create table if not exists public.gsc_performance (
  site text not null,
  date date not null,
  page text,
  query text,
  country text,
  device text,
  clicks integer not null,
  impressions integer not null,
  ctr numeric not null,
  position numeric not null,
  primary key (site, date, page, query, country, device)
);

-- Helpful indexes (optional)
create index if not exists gsc_perf_site_date_idx on public.gsc_performance (site, date);
create index if not exists gsc_perf_page_idx on public.gsc_performance (page);
create index if not exists gsc_perf_query_idx on public.gsc_performance (query);
