-- Run this once real sign-in has been checked end to end. It removes everything that only existed for the dev
-- bypass: every policy that lets the anonymous (signed-out) role touch data, plus the admin_open switch.
-- Reference lists (documents, event types, standard kinds) stay readable. Signed-in access is untouched.

do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where roles = '{anon}'
      and not (schemaname = 'public' and tablename in ('doc_library','event_type','event_type_doc','standard_kind') and cmd = 'SELECT')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

drop function if exists dev_admin_open();
drop table if exists dev_flags;
