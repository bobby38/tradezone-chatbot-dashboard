-- Tool run telemetry for agent diagnostics
create table if not exists public.chat_tool_runs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  request_id uuid not null,
  session_id text not null,
  tool_name text not null,
  args jsonb,
  result_preview text,
  source text,
  success boolean not null default true,
  latency_ms integer,
  error_message text
);

create index if not exists idx_chat_tool_runs_request
  on public.chat_tool_runs (request_id, created_at);

create index if not exists idx_chat_tool_runs_tool
  on public.chat_tool_runs (tool_name, created_at desc);
