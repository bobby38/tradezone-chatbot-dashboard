-- Trade-in lead management schema

-- reset objects to avoid duplicate-column errors when re-running
drop table if exists public.trade_in_media cascade;
drop table if exists public.trade_in_actions cascade;
drop table if exists public.trade_in_tags cascade;
drop table if exists public.trade_in_leads cascade;

drop type if exists public.trade_in_status cascade;
drop type if exists public.trade_in_channel cascade;
drop type if exists public.trade_in_condition cascade;
drop type if exists public.trade_in_payout cascade;
drop type if exists public.trade_in_fulfilment cascade;

-- enums (idempotent guards)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'trade_in_status') then
    create type public.trade_in_status as enum (
      'new',
      'in_review',
      'quoted',
      'awaiting_customer',
      'scheduled',
      'completed',
      'closed',
      'archived'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'trade_in_channel') then
    create type public.trade_in_channel as enum (
      'chat',
      'web_form',
      'manual',
      'import'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'trade_in_condition') then
    create type public.trade_in_condition as enum (
      'mint',
      'good',
      'fair',
      'faulty'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'trade_in_payout') then
    create type public.trade_in_payout as enum (
      'cash',
      'paynow',
      'bank'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'trade_in_fulfilment') then
    create type public.trade_in_fulfilment as enum (
      'walk_in',
      'pickup',
      'courier'
    );
  end if;
end $$;

create table if not exists public.trade_in_leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  channel public.trade_in_channel not null default 'chat',
  status public.trade_in_status not null default 'new',
  session_id text,
  category text,
  brand text,
  model text,
  storage text,
  condition public.trade_in_condition,
  defects jsonb not null default '[]'::jsonb,
  accessories jsonb not null default '[]'::jsonb,
  purchase_year integer,
  price_hint numeric(10,2),
  range_min numeric(10,2),
  range_max numeric(10,2),
  pricing_version text,
  preferred_payout public.trade_in_payout,
  preferred_fulfilment public.trade_in_fulfilment,
  contact_name text,
  contact_phone text,
  contact_email text,
  telegram_handle text,
  source_message_summary text,
  lead_hash text,
  notes text,
  assigned_to uuid,
  created_by uuid,
  last_contacted_at timestamptz,
  follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trade_in_media (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.trade_in_leads(id) on delete cascade,
  media_type text not null check (media_type in ('image','video','document')),
  url text not null,
  thumbnail_url text,
  mime_type text,
  size_bytes bigint,
  width integer,
  height integer,
  created_at timestamptz not null default now()
);

create table if not exists public.trade_in_actions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.trade_in_leads(id) on delete cascade,
  action_type text not null check (action_type in (
    'status_change',
    'note',
    'email_sent',
    'sms_sent',
    'telegram_sent',
    'tag_added',
    'tag_removed',
    'assignment',
    'import'
  )),
  payload jsonb not null default '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.trade_in_tags (
  lead_id uuid not null references public.trade_in_leads(id) on delete cascade,
  tag text not null,
  created_at timestamptz not null default now(),
  primary key (lead_id, tag)
);

-- indexes for performance
create index if not exists idx_trade_in_leads_status_created_at
  on public.trade_in_leads (status, created_at desc);

create index if not exists idx_trade_in_leads_brand_model
  on public.trade_in_leads (brand, model);

create index if not exists idx_trade_in_leads_assigned
  on public.trade_in_leads (assigned_to, status);

create index if not exists idx_trade_in_leads_follow_up
  on public.trade_in_leads (follow_up_at);

create index if not exists idx_trade_in_actions_lead
  on public.trade_in_actions (lead_id, created_at desc);

create index if not exists idx_trade_in_media_lead
  on public.trade_in_media (lead_id);

-- simple trigger to keep updated_at current
create or replace function public.trade_in_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_trade_in_leads_updated
  before update on public.trade_in_leads
  for each row
  execute function public.trade_in_set_updated_at();

insert into storage.buckets (id, name, public)
select 'tradein-media', 'tradein-media', false
where not exists (select 1 from storage.buckets where id = 'tradein-media');

-- row level security (default deny)
alter table public.trade_in_leads enable row level security;
alter table public.trade_in_media enable row level security;
alter table public.trade_in_actions enable row level security;
alter table public.trade_in_tags enable row level security;

-- Basic policies (service role + admin/editor via RPC). Adjust when dashboard auth wired.
create policy trade_in_leads_service_access on public.trade_in_leads
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy trade_in_media_service_access on public.trade_in_media
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy trade_in_actions_service_access on public.trade_in_actions
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy trade_in_tags_service_access on public.trade_in_tags
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
