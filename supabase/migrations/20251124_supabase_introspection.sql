-- Utility helpers to inspect Supabase RLS policies and indexes without touching data
-- Run via scripts/export-supabase-lint-data.ts to snapshot policy state before changing anything

create or replace function public.get_rls_policies()
returns table (
  schema_name text,
  table_name text,
  policy_name text,
  command text,
  permissive boolean,
  roles text[],
  using_expression text,
  check_expression text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
    select
      n.nspname::text as schema_name,
      c.relname::text as table_name,
      pol.polname::text as policy_name,
      pol.polcmd::text as command,
      pol.polpermissive as permissive,
      coalesce(
        array(
          select pg_get_userbyid(role_oid)::text
          from unnest(coalesce(pol.polroles, array[]::oid[])) as role_oid
          order by pg_get_userbyid(role_oid)
        ),
        array['<all_roles>']
      ) as roles,
      pg_get_expr(pol.polqual, pol.polrelid)::text as using_expression,
      pg_get_expr(pol.polwithcheck, pol.polrelid)::text as check_expression
    from pg_policy pol
    join pg_class c on pol.polrelid = c.oid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
    order by c.relname, pol.polname;
end;
$$;

revoke all on function public.get_rls_policies() from public;
grant execute on function public.get_rls_policies() to service_role;

create or replace function public.get_permissive_policy_collisions()
returns table (
  schema_name text,
  table_name text,
  command text,
  roles text[],
  policy_names text[]
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
    with policy_roles as (
      select
        pol.*,
        coalesce(
        array(
            select pg_get_userbyid(role_oid)::text
            from unnest(coalesce(pol.polroles, array[]::oid[])) as role_oid
            order by pg_get_userbyid(role_oid)
          ),
          array['<all_roles>']
        )::text[] as role_names
      from pg_policy pol
    )
    select
      n.nspname::text as schema_name,
      c.relname::text as table_name,
      pr.polcmd::text as command,
      pr.role_names as roles,
      array_agg(pr.polname::text order by pr.polname) as policy_names
    from policy_roles pr
    join pg_class c on pr.polrelid = c.oid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and pr.polpermissive is true
    group by n.nspname, c.relname, pr.polcmd, pr.role_names
    having count(*) > 1
    order by c.relname;
end;
$$;

revoke all on function public.get_permissive_policy_collisions() from public;
grant execute on function public.get_permissive_policy_collisions() to service_role;

create or replace function public.get_duplicate_indexes()
returns table (
  schema_name text,
  table_name text,
  column_signature text,
  index_names text[]
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
    select
      n.nspname::text as schema_name,
      t.relname::text as table_name,
      array_to_string(idx.indkey, ',') as column_signature,
      array_agg(i.relname::text order by i.relname) as index_names
    from pg_index idx
    join pg_class i on idx.indexrelid = i.oid
    join pg_class t on idx.indrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
    group by n.nspname, t.relname, idx.indkey, idx.indoption
    having count(*) > 1
    order by t.relname;
end;
$$;

revoke all on function public.get_duplicate_indexes() from public;
grant execute on function public.get_duplicate_indexes() to service_role;
