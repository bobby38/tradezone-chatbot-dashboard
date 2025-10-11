-- Create table for detailed chat request logging
create table if not exists public.chat_request_logs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  request_id uuid not null,
  session_id text not null,
  source text not null default 'unknown', -- e.g. widget, dashboard, api, n8n
  prompt text not null,
  history_length integer not null default 0,
  final_response text,
  model text,
  status text not null default 'pending', -- success | error
  latency_ms integer,
  tool_summary jsonb,
  error_message text,
  user_agent text,
  ip_address inet,
  request_payload jsonb,
  response_payload jsonb
);

create index if not exists idx_chat_request_logs_created_at
  on public.chat_request_logs (created_at desc);

create index if not exists idx_chat_request_logs_session
  on public.chat_request_logs (session_id, created_at desc);

create index if not exists idx_chat_request_logs_request
  on public.chat_request_logs (request_id);
