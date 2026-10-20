-- Build 5: the company master. One row of answers per company, an activity log, and every file with its versions.
-- Run in the Supabase SQL editor (or through the connected MCP) after 20261021_master_data.sql.

create table if not exists company_master (
  company_id uuid primary key references company(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  steps_done int[] not null default '{}',
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by_name text
);

-- Every answer change, upload, replacement and removal.
create table if not exists master_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id) on delete cascade,
  at timestamptz not null default now(),
  who_name text,
  step int,
  kind text not null,          -- answer | upload | replace | remove | complete | reopen
  note text not null,
  reason text
);

-- A file is never overwritten: each upload is a new version of the same request key. Removing keeps the row.
create table if not exists file_version (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id) on delete cascade,
  req_key text not null,       -- the request it answers: a standard document key, an event document key, or a monthly item key
  period text,                 -- null for once-only documents, 'YYYY-MM' for monthly ones
  version int not null,
  storage_path text not null,
  filename text not null,
  by_name text,
  by_role text,
  at timestamptz not null default now(),
  reason text,
  removed boolean not null default false,
  unique (company_id, req_key, period, version)
);
create index if not exists file_version_req on file_version (company_id, req_key);

alter table company_master enable row level security;
alter table master_log enable row level security;
alter table file_version enable row level security;

do $$ declare t text; begin
 foreach t in array array['company_master','master_log','file_version'] loop
  execute format('create policy "read my companies" on %I for select to authenticated using (company_id in (select my_company_ids()))', t);
  -- founder, external practitioner and PBA can all answer and upload; each upload is tagged with who did it
  execute format('create policy "members write" on %I for insert to authenticated with check (company_id = (select company_id from current_app_user()))', t);
 end loop;
end $$;
create policy "members update company_master" on company_master for update to authenticated
  using (company_id = (select company_id from current_app_user()));
create policy "members update file_version" on file_version for update to authenticated
  using (company_id = (select company_id from current_app_user()));

-- The first month monthly close tracks from (set by the master, changeable in Monthly close).
alter table company add column if not exists tracking_start text;
