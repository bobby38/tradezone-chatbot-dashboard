-- Agent tooling tables for deterministic order/inspection/review flows
create table if not exists public.agent_orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id text,
  user_id text,
  product_id text not null,
  payment_method text not null,
  options jsonb,
  status text not null default 'queued'
);

create table if not exists public.agent_inspections (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id text,
  user_id text,
  store_id text not null default 'hougang',
  timeslot text not null,
  notes text
);

create table if not exists public.agent_review_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id text not null,
  reason text not null,
  payload jsonb,
  status text not null default 'open'
);

alter table public.agent_orders enable row level security;
alter table public.agent_inspections enable row level security;
alter table public.agent_review_queue enable row level security;

create policy "agent_orders_service_access" on public.agent_orders
  for all using (auth.role() = 'service_role');
create policy "agent_inspections_service_access" on public.agent_inspections
  for all using (auth.role() = 'service_role');
create policy "agent_review_queue_service_access" on public.agent_review_queue
  for all using (auth.role() = 'service_role');
