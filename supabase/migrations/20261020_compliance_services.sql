-- Master > Services / Team / Custom types (the CXO Lens pages). Run after 20261019_compliance.sql.

-- A registration can now also be a custom compliance type (Fire NOC, FSSAI renewal ...).
do $$ declare c text; begin
  for c in select conname from pg_constraint
           where conrelid = 'registration'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%' loop
    execute format('alter table registration drop constraint %I', c);
  end loop;
end $$;
alter table registration add constraint registration_kind_check check (kind in ('gst','tan','entity','custom'));

-- Team: the default owner for each service's rows (the obligation owner is a role: founder, practitioner or PBA).
create table if not exists compliance_team (
  company_id uuid not null references company(id) on delete cascade,
  service text not null check (service in ('GST','TDS','ITR','Custom')),
  owner text not null check (owner in ('founder','practitioner','pba')),
  primary key (company_id, service)
);

-- Custom types: a company's own non-statutory items. Each one has a registration row so its entries are keyed like the rest.
create table if not exists custom_compliance_type (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id) on delete cascade,
  registration_id uuid not null references registration(id) on delete cascade,
  name text not null,
  frequency text not null check (frequency in ('monthly','quarterly','yearly')),
  due_rule jsonb not null,
  owner text not null default 'practitioner' check (owner in ('founder','practitioner','pba')),
  created_at timestamptz not null default now()
);

alter table compliance_team enable row level security;
alter table custom_compliance_type enable row level security;
do $$ declare t text; begin
 foreach t in array array['compliance_team','custom_compliance_type'] loop
  execute format('create policy "read my companies" on %I for select to authenticated using (company_id in (select my_company_ids()))', t);
  execute format('create policy "maintainers write" on %I for insert to authenticated with check (company_id = (select company_id from current_app_user()) and (select role from current_app_user()) in (''practitioner'',''pba''))', t);
  execute format('create policy "maintainers update" on %I for update to authenticated using (company_id = (select company_id from current_app_user()) and (select role from current_app_user()) in (''practitioner'',''pba''))', t);
 end loop;
end $$;
