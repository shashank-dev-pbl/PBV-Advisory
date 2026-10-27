-- Outreach: the LinkedIn bot's leads, stored in this project's own database (dev and prod each have their own copy).
-- Touches only the outreach_* tables and outreach_* functions below. It reads two existing helpers (is_platform_admin and the
-- app_user table) to decide who is PBA staff, and changes nothing else. Safe to run more than once. Creates no leads.
--
-- Run it in the SQL editor of the project it is meant for: the dev project for testing, the prod project for production.
-- Then give the bot its key, once per project (the key is stored only as a hash):   select outreach_set_key('your-long-random-key');

begin;

-- The leads the bot works through. Same columns the extension already reads and writes.
create table if not exists outreach_queue (
  id bigint generated always as identity primary key,
  company_name text not null,
  company_key text not null unique,            -- lowercased, punctuation-stripped name; stops the same company being queued twice
  website text, hq text, sector text, total_raised_text text,
  stage text not null default 'new' check (stage in (
    'new','needs_review','no_founder','founder_found','connect_sent','accepted','dm_sent','replied','cannot_connect','skipped','stale')),
  linkedin_company_url text,
  founder_name text, founder_title text, founder_url text, founder_candidates jsonb,
  connect_sent_at timestamptz, accepted_at timestamptz, dm_sent_at timestamptz, replied_at timestamptz,
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists outreach_queue_stage_idx on outreach_queue (stage);

-- Everything the extension reports (connection sent, message sent, reply seen), kept as history.
create table if not exists outreach_event (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  action_type text not null,
  profile_url text, profile_name text, company text,
  occurred_at timestamptz,
  queue_id bigint references outreach_queue(id) on delete set null
);
create index if not exists outreach_event_queue_idx on outreach_event (queue_id);

-- One row: the hash of the key the extension must send. Nobody can read it through the API.
create table if not exists outreach_settings (
  id int primary key default 1 check (id = 1),
  key_hash text
);
insert into outreach_settings (id) values (1) on conflict (id) do nothing;

alter table outreach_queue enable row level security;
alter table outreach_event enable row level security;
alter table outreach_settings enable row level security;

-- PBA staff and platform admins.
create or replace function outreach_staff() returns boolean language sql stable security definer set search_path = public as $$
  select is_platform_admin() or exists (select 1 from app_user where auth_user_id = auth.uid() and account_type in ('pba', 'admin'))
$$;
revoke all on function outreach_staff() from public, anon;
grant execute on function outreach_staff() to authenticated;

drop policy if exists "staff read outreach_queue" on outreach_queue;
create policy "staff read outreach_queue" on outreach_queue for select to authenticated using (outreach_staff());
drop policy if exists "staff read outreach_event" on outreach_event;
create policy "staff read outreach_event" on outreach_event for select to authenticated using (outreach_staff());

-- ---- the key -------------------------------------------------------------------------------------------------------
-- Only someone with database access (the SQL editor) can set it.
create or replace function outreach_set_key(p_key text) returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if coalesce(length(p_key), 0) < 24 then raise exception 'Use a key of at least 24 characters'; end if;
  update outreach_settings set key_hash = encode(extensions.digest(convert_to(p_key, 'utf8'), 'sha256'), 'hex') where id = 1;
end $$;
revoke all on function outreach_set_key(text) from public, anon, authenticated;

create or replace function outreach_auth(p_key text) returns void language plpgsql stable security definer set search_path = public, extensions as $$
declare h text;
begin
  select key_hash into h from outreach_settings where id = 1;
  if h is null or p_key is null or h <> encode(extensions.digest(convert_to(p_key, 'utf8'), 'sha256'), 'hex') then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;
end $$;
revoke all on function outreach_auth(text) from public, anon, authenticated;

-- ---- what the extension calls (through the portal's /api/queue and /api/activity), each one checks the key ----------
create or replace function outreach_queue_counts(p_key text) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform outreach_auth(p_key);
  return coalesce((select jsonb_object_agg(stage, n) from (select stage, count(*) n from outreach_queue group by stage) s), '{}'::jsonb);
end $$;

create or replace function outreach_queue_list(p_key text, p_stages text[], p_limit int) returns setof outreach_queue
language plpgsql stable security definer set search_path = public as $$
begin
  perform outreach_auth(p_key);
  return query select * from outreach_queue
    where p_stages is null or cardinality(p_stages) = 0 or stage = any(p_stages)
    order by id limit least(greatest(coalesce(p_limit, 20), 1), 200);
end $$;

-- Companies from the funding dashboard. Existing ones are left untouched.
create or replace function outreach_queue_import(p_key text, p_companies jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare c jsonb; nm text; k text; added int := 0; total int := 0; n int;
begin
  perform outreach_auth(p_key);
  for c in select * from jsonb_array_elements(coalesce(p_companies, '[]'::jsonb)) loop
    total := total + 1;
    nm := btrim(coalesce(c ->> 'name', ''));
    k := regexp_replace(regexp_replace(lower(nm), '\y(pvt|private|ltd|limited|inc|llp|technologies|technology)\y\.?', '', 'g'), '[^a-z0-9]+', '', 'g');
    if nm = '' or k = '' then continue; end if;
    insert into outreach_queue (company_name, company_key, website, hq, sector, total_raised_text)
    values (nm, k, nullif(c ->> 'website', ''), nullif(c ->> 'hq', ''), nullif(c ->> 'sector', ''), nullif(c ->> 'total_raised', ''))
    on conflict (company_key) do nothing;
    get diagnostics n = row_count;
    added := added + n;
  end loop;
  return jsonb_build_object('received', total, 'added', added, 'alreadyQueued', total - added, 'alreadyContacted', 0);
end $$;

-- Update one lead. Only the fields the bot is allowed to change; a field is touched only if it is in p_patch.
create or replace function outreach_queue_patch(p_key text, p_id bigint, p_patch jsonb) returns outreach_queue
language plpgsql security definer set search_path = public as $$
declare r outreach_queue;
begin
  perform outreach_auth(p_key);
  update outreach_queue set
    stage = case when p_patch ? 'stage' then p_patch ->> 'stage' else stage end,
    linkedin_company_url = case when p_patch ? 'linkedin_company_url' then p_patch ->> 'linkedin_company_url' else linkedin_company_url end,
    founder_name = case when p_patch ? 'founder_name' then p_patch ->> 'founder_name' else founder_name end,
    founder_title = case when p_patch ? 'founder_title' then p_patch ->> 'founder_title' else founder_title end,
    founder_url = case when p_patch ? 'founder_url' then p_patch ->> 'founder_url' else founder_url end,
    founder_candidates = case when p_patch ? 'founder_candidates' then nullif(p_patch -> 'founder_candidates', 'null'::jsonb) else founder_candidates end,
    connect_sent_at = case when p_patch ? 'connect_sent_at' then (p_patch ->> 'connect_sent_at')::timestamptz else connect_sent_at end,
    accepted_at = case when p_patch ? 'accepted_at' then (p_patch ->> 'accepted_at')::timestamptz else accepted_at end,
    dm_sent_at = case when p_patch ? 'dm_sent_at' then (p_patch ->> 'dm_sent_at')::timestamptz else dm_sent_at end,
    replied_at = case when p_patch ? 'replied_at' then (p_patch ->> 'replied_at')::timestamptz else replied_at end,
    last_error = case when p_patch ? 'last_error' then p_patch ->> 'last_error' else last_error end,
    attempts = attempts + case when coalesce((p_patch ->> 'bump_attempts')::boolean, false) then 1 else 0 end,
    updated_at = now()
  where id = p_id returning * into r;
  if not found then raise exception 'Unknown lead'; end if;
  return r;
end $$;

-- A note of something the extension did. Matched to the lead by the founder's LinkedIn link when it can be.
create or replace function outreach_event_add(p_key text, p_event jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare q bigint; u text := lower(regexp_replace(split_part(coalesce(p_event ->> 'profile_url', ''), '?', 1), '/$', ''));
begin
  perform outreach_auth(p_key);
  if u <> '' then
    select id into q from outreach_queue where lower(regexp_replace(split_part(coalesce(founder_url, ''), '?', 1), '/$', '')) = u order by id limit 1;
  end if;
  insert into outreach_event (action_type, profile_url, profile_name, company, occurred_at, queue_id)
  values (coalesce(p_event ->> 'action_type', 'unknown'), p_event ->> 'profile_url', p_event ->> 'profile_name', p_event ->> 'company',
          nullif(p_event ->> 'occurred_at', '')::timestamptz, q);
  return jsonb_build_object('matched', q is not null, 'table', 'outreach_queue');
end $$;

revoke all on function outreach_queue_counts(text), outreach_queue_list(text, text[], int), outreach_queue_import(text, jsonb),
  outreach_queue_patch(text, bigint, jsonb), outreach_event_add(text, jsonb) from public;
grant execute on function outreach_queue_counts(text), outreach_queue_list(text, text[], int), outreach_queue_import(text, jsonb),
  outreach_queue_patch(text, bigint, jsonb), outreach_event_add(text, jsonb) to anon, authenticated;

-- ---- what the Outreach page calls (signed-in PBA staff, no key) ----------------------------------------------------
create or replace function outreach_stage_counts() returns table (stage text, n bigint) language plpgsql stable security definer set search_path = public as $$
begin
  if not outreach_staff() then raise exception 'No access'; end if;
  return query select q.stage, count(*) from outreach_queue q group by q.stage;
end $$;

-- "Fix this lead": give the bot the founder it could not find. Only leads in Needs review or No founder found.
create or replace function outreach_give_founder(p_id bigint, p_founder_url text, p_founder_name text, p_founder_title text, p_company_url text)
returns void language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not outreach_staff() then raise exception 'You don''t have access to this action'; end if;
  update outreach_queue set
    stage = 'founder_found', founder_url = p_founder_url, founder_name = p_founder_name, founder_title = nullif(p_founder_title, ''),
    linkedin_company_url = coalesce(nullif(p_company_url, ''), linkedin_company_url), last_error = null, updated_at = now()
  where id = p_id and stage in ('needs_review', 'no_founder');
  get diagnostics n = row_count;
  if n = 0 then raise exception 'This lead has already moved on'; end if;
end $$;

revoke all on function outreach_stage_counts(), outreach_give_founder(bigint, text, text, text, text) from public, anon;
grant execute on function outreach_stage_counts(), outreach_give_founder(bigint, text, text, text, text) to authenticated;

commit;
