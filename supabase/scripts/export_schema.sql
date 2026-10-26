-- Read-only. Run in the SQL Editor of the PRODUCTION project. It returns ONE cell: the whole public schema as SQL.
-- Copy that cell, then run it in the DEV project's SQL Editor. No data is read or written.
with
enums as (
  select 10 as ord, format('create type public.%I as enum (%s);', t.typname,
    (select string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid)) as stmt
  from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typtype = 'e'
),
tables as (
  select 20, format('create table public.%I (%s);', c.relname,
    (select string_agg(format('%I %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
        case when a.attnotnull then ' not null' else '' end,
        case when d.adbin is not null then ' default ' || pg_get_expr(d.adbin, d.adrelid) else '' end), ', ' order by a.attnum)
     from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped))
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'
),
funcs as (
  select 30, pg_get_functiondef(p.oid) || ';' from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind in ('f', 'p')
),
cons_first as (
  select 40, format('alter table public.%I add constraint %I %s;', c.relname, k.conname, pg_get_constraintdef(k.oid))
  from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and k.contype in ('p', 'u', 'c')
),
cons_fk as (
  select 50, format('alter table public.%I add constraint %I %s;', c.relname, k.conname, pg_get_constraintdef(k.oid))
  from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and k.contype = 'f'
),
idx as (
  select 60, pg_get_indexdef(i.indexrelid) || ';' from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not i.indisprimary and not exists (select 1 from pg_constraint k where k.conindid = i.indexrelid)
),
views as (
  select 70, format('create view public.%I as %s', c.relname, pg_get_viewdef(c.oid)) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
),
trg as (
  select 80, pg_get_triggerdef(t.oid) || ';' from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal
),
rls as (
  select 90, format('alter table public.%I enable row level security;', c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
),
pol as (
  select 100, format('create policy %I on public.%I as %s for %s to %s%s%s;', policyname, tablename, permissive, cmd,
    array_to_string(roles, ', '), coalesce(' using (' || qual || ')', ''), coalesce(' with check (' || with_check || ')', ''))
  from pg_policies where schemaname = 'public'
),
bucket as (
  select 110, format('insert into storage.buckets (id, name, public) values (%L, %L, %L) on conflict do nothing;', id, name, public) from storage.buckets
),
allstmts as (
  select * from enums union all select * from tables union all select * from funcs union all select * from cons_first union all select * from cons_fk
  union all select * from idx union all select * from views union all select * from trg union all select * from rls union all select * from pol union all select * from bucket
)
select 'set check_function_bodies = false;' || E'\n' || string_agg(stmt, E'\n' order by ord) as schema_sql from allstmts;
