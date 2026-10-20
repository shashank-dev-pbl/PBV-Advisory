-- Build 5 · Monthly close. One row per company per month for the submit / publish state, and one row per verified filing.
-- Files and typed figures already live in file_version and file_summary (20261023); requests and filing rows are generated
-- from the company master, so nothing else is stored.

create table if not exists month (
  company_id uuid not null references company(id) on delete cascade,
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  submitted_by uuid, submitted_by_name text, submitted_at timestamptz,
  published_by uuid, published_by_name text, published_at timestamptz,
  reopened jsonb not null default '[]'::jsonb,       -- [{by, at, reason}]
  primary key (company_id, period)
);

create table if not exists filing_verify (
  company_id uuid not null references company(id) on delete cascade,
  period text not null,
  filing_key text not null,
  verified_by_name text not null, verified_at timestamptz not null default now(),
  primary key (company_id, period, filing_key)
);

alter table month enable row level security;
alter table filing_verify enable row level security;

do $$ declare t text; begin
  foreach t in array array['month','filing_verify'] loop
    execute format('create policy "read my companies" on %I for select to authenticated using (company_id in (select my_company_ids()))', t);
    execute format('create policy "members write" on %I for insert to authenticated with check (company_id = (select company_id from current_app_user()))', t);
    execute format('create policy "members update" on %I for update to authenticated using (company_id = (select company_id from current_app_user()))', t);
  end loop;
end $$;
