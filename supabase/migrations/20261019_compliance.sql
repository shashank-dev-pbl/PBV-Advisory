-- Build 5, steps 1-3: master documents, registrations, and the compliance rules that turn confirmed facts into
-- obligation rows. Rules are DATA (compliance_rule) so a company secretary can correct a due date without a release.
-- Run in the Supabase SQL editor on the portal project.

-- ---------------------------------------------------------------- rules (editable data)
create table if not exists compliance_rule (
  code text primary key,
  service text not null,                       -- GST | TDS | ITR
  name text not null,
  category text not null,
  registration_kind text not null check (registration_kind in ('gst','tan','entity')),
  frequency text not null check (frequency in ('monthly','quarterly','yearly')),
  -- monthly:   {"day":11,"months_after":1}                    (due on that day, that many months after the period month)
  -- quarterly: {"by_quarter":{"1":"07-31","2":"10-31","3":"01-31","4":"05-31"}}   (fiscal quarters, Q1 = Apr-Jun)
  -- yearly:    {"mmdd":"12-31","years_after_fy_start":1}
  due_rule jsonb not null,
  -- what a registration must look like for the rule to apply, e.g. {"filing_type":"regular"} or {"form":"26Q"}
  applies_when jsonb not null default '{}'::jsonb,
  owner_default text not null default 'practitioner' check (owner_default in ('founder','practitioner','pba')),
  sort int not null default 0,
  active boolean not null default true
);

insert into compliance_rule (code, service, name, category, registration_kind, frequency, due_rule, applies_when, owner_default, sort) values
 ('gstr1',  'GST', 'GSTR-1',  'GST', 'gst', 'monthly', '{"day":11,"months_after":1}', '{"filing_type":"regular"}', 'practitioner', 10),
 ('gstr3b', 'GST', 'GSTR-3B', 'GST', 'gst', 'monthly', '{"day":20,"months_after":1}', '{"filing_type":"regular"}', 'practitioner', 20),
 ('gstr9',  'GST', 'GSTR-9',  'GST', 'gst', 'yearly',  '{"mmdd":"12-31","years_after_fy_start":1}', '{"filing_type":"regular"}', 'practitioner', 30),
 ('tds_payment', 'TDS', 'TDS payment', 'TDS', 'tan', 'monthly', '{"day":7,"months_after":1}', '{}', 'practitioner', 10),
 ('tds_24q',  'TDS', 'TDS return 24Q',  'TDS', 'tan', 'quarterly', '{"by_quarter":{"1":"07-31","2":"10-31","3":"01-31","4":"05-31"}}', '{"form":"24Q"}',  'practitioner', 20),
 ('tds_26q',  'TDS', 'TDS return 26Q',  'TDS', 'tan', 'quarterly', '{"by_quarter":{"1":"07-31","2":"10-31","3":"01-31","4":"05-31"}}', '{"form":"26Q"}',  'practitioner', 30),
 ('tds_27q',  'TDS', 'TDS return 27Q',  'TDS', 'tan', 'quarterly', '{"by_quarter":{"1":"07-31","2":"10-31","3":"01-31","4":"05-31"}}', '{"form":"27Q"}',  'practitioner', 40),
 ('tds_27eq', 'TDS', 'TCS return 27EQ', 'TDS', 'tan', 'quarterly', '{"by_quarter":{"1":"07-31","2":"10-31","3":"01-31","4":"05-31"}}', '{"form":"27EQ"}', 'practitioner', 50),
 ('itr_nonaudit', 'ITR', 'Income tax return (non-audit)',        'ITR', 'entity', 'yearly', '{"mmdd":"07-31","years_after_fy_start":1}', '{"itr_basis":"non_audit"}', 'practitioner', 10),
 ('itr_audit',    'ITR', 'Income tax return (audit)',            'ITR', 'entity', 'yearly', '{"mmdd":"10-31","years_after_fy_start":1}', '{"itr_basis":"audit"}',     'practitioner', 20),
 ('itr_tp',       'ITR', 'Income tax return (transfer pricing)', 'ITR', 'entity', 'yearly', '{"mmdd":"11-30","years_after_fy_start":1}', '{"itr_basis":"tp"}',        'practitioner', 30)
on conflict (code) do nothing;

-- ---------------------------------------------------------------- per-company facts
create table if not exists registration (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id) on delete cascade,
  kind text not null check (kind in ('gst','tan','entity')),
  identifier text not null,                                   -- GSTIN, TAN, or CIN / 'ENTITY'
  state text,
  filing_type text check (filing_type in ('regular','qrmp','composition')),
  forms text[] not null default '{}',
  status text not null default 'active' check (status in ('active','closed')),
  confirmed_by_name text,
  confirmed_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (company_id, kind, identifier)
);

create table if not exists compliance_setting (
  company_id uuid primary key references company(id) on delete cascade,
  entity_type text,
  effective_from date,
  start_fy int not null default 2024,                         -- first financial year tracked, by the year it starts in
  itr_basis text not null default 'auto' check (itr_basis in ('auto','non_audit','audit','tp')),
  updated_at timestamptz not null default now()
);

create table if not exists master_document (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id) on delete cascade,
  kind text not null check (kind in ('gst','tan','coi')),
  storage_path text not null,
  filename text not null,
  uploaded_by_name text,
  uploaded_at timestamptz not null default now(),
  registration_id uuid references registration(id) on delete set null   -- set once the details are confirmed
);

create table if not exists compliance_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id) on delete cascade,
  at timestamptz not null default now(),
  who_name text,
  note text not null,
  result text
);

-- generated obligations carry where they came from, so saving again cannot duplicate them
alter table obligation add column if not exists rule_code text;
alter table obligation add column if not exists registration_id uuid references registration(id) on delete set null;
alter table obligation add column if not exists closed_reason text;
create unique index if not exists obligation_generated_key on obligation (company_id, rule_code, registration_id, period);

-- ---------------------------------------------------------------- access
alter table compliance_rule enable row level security;
alter table registration enable row level security;
alter table compliance_setting enable row level security;
alter table master_document enable row level security;
alter table compliance_log enable row level security;

create policy "read compliance_rule" on compliance_rule for select to authenticated using (true);
create policy "admin writes compliance_rule" on compliance_rule for all to authenticated using (is_platform_admin()) with check (is_platform_admin());

do $$ declare t text; begin
 foreach t in array array['registration','compliance_setting','master_document','compliance_log'] loop
  execute format('create policy "read my companies" on %I for select to authenticated using (company_id in (select my_company_ids()))', t);
 end loop;
end $$;

-- Confirming facts is for the external practitioner and PBA (an admin acts as PBA), in the company they are acting in.
do $$ declare t text; begin
 foreach t in array array['registration','compliance_setting','compliance_log'] loop
  execute format('create policy "maintainers write" on %I for insert to authenticated with check (company_id = (select company_id from current_app_user()) and (select role from current_app_user()) in (''practitioner'',''pba''))', t);
  execute format('create policy "maintainers update" on %I for update to authenticated using (company_id = (select company_id from current_app_user()) and (select role from current_app_user()) in (''practitioner'',''pba''))', t);
 end loop;
end $$;

-- Anyone on the company, founder included, can upload a master document; only maintainers can link it to confirmed details.
create policy "members upload master_document" on master_document for insert to authenticated
  with check (company_id = (select company_id from current_app_user()));
create policy "maintainers update master_document" on master_document for update to authenticated
  using (company_id = (select company_id from current_app_user()) and (select role from current_app_user()) in ('practitioner','pba'));

-- Generated obligations are written (and closed) by the same people.
create policy "maintainers insert obligation" on obligation for insert to authenticated
  with check (company_id = (select company_id from current_app_user()) and (select role from current_app_user()) in ('practitioner','pba'));
create policy "maintainers update obligation" on obligation for update to authenticated
  using (company_id = (select company_id from current_app_user()) and (select role from current_app_user()) in ('practitioner','pba'));
