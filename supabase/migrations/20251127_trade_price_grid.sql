create table if not exists public.trade_price_grid (
  id uuid primary key default gen_random_uuid(),
  product_family text not null,
  product_model text not null,
  variant text,
  condition text not null,
  trade_in_value_min numeric(10,2),
  trade_in_value_max numeric(10,2),
  brand_new_price numeric(10,2),
  source text,
  source_url text,
  price_grid_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists trade_price_grid_unique
  on public.trade_price_grid (product_family, product_model, coalesce(variant, ''), condition);

create or replace function public.set_trade_price_grid_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_trade_price_grid_updated
  before update on public.trade_price_grid
  for each row
  execute function public.set_trade_price_grid_updated_at();

alter table public.trade_price_grid enable row level security;

create policy if not exists "trade_price_grid_read_authenticated"
  on public.trade_price_grid
  for select
  using (true);

create policy if not exists "trade_price_grid_insert_service"
  on public.trade_price_grid
  for insert
  with check (auth.role() = 'service_role');

create policy if not exists "trade_price_grid_update_service"
  on public.trade_price_grid
  for update
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
