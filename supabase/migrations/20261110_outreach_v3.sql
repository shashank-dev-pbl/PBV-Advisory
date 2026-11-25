-- Outreach v3: the funding-signal sequence from the approved prototype (pba-linkedin-outreach-prototype.html).
-- Discovered -> Verifying -> Verified (to approve) -> Connection sent -> Connected -> Message 1 -> Follow-up 1 -> Follow-up 2
-- -> Replied -> Interested, with the closed reasons Excluded, Could not verify, Connection not accepted, No reply, Not interested, Nurture.
--
-- Builds on 20261029_outreach.sql (run that first). Touches only outreach_* tables and functions. Safe to run more than once.
-- Existing leads are kept and moved onto the new stage names (mapping below). Creates no leads.
--
-- Run it in the SQL editor of the project it is meant for: dev first, prod after it has been tested.

begin;

-- ---- columns ---------------------------------------------------------------------------------------------------------
alter table outreach_queue
  add column if not exists round_name text,                 -- Seed, Series A ...
  add column if not exists round_amount text,               -- "₹62 Cr", "$3.2M"
  add column if not exists lead_investor text,
  add column if not exists investors text,
  add column if not exists description text,                -- what the company does
  add column if not exists announced_on date,
  add column if not exists hook text,                       -- the one line about the company used in Message 1
  add column if not exists approved boolean not null default false,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid,
  add column if not exists paused boolean not null default false,
  add column if not exists already_first boolean not null default false,   -- already a 1st-degree connection
  add column if not exists flag text,                       -- needs_review | no_founder: the founder lookup needs a person
  add column if not exists stage_since timestamptz not null default now(),
  add column if not exists verified_at timestamptz,
  add column if not exists fu1_sent_at timestamptz,
  add column if not exists fu2_sent_at timestamptz,
  add column if not exists reply_text text,
  add column if not exists reply_label text,                -- Interested, Asking for info, Referral, Not now, Not interested, Unclear
  add column if not exists overrides jsonb not null default '{}'::jsonb,   -- per-company message edits
  add column if not exists referred_from bigint;

alter table outreach_event add column if not exists detail text;   -- the plain sentence shown in a company's History

-- ---- stages ----------------------------------------------------------------------------------------------------------
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'outreach_queue'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%stage%' loop
    execute format('alter table outreach_queue drop constraint %I', c.conname);
  end loop;
end $$;

-- Everything the bot had already contacted counts as approved. Leads still waiting for a founder keep waiting, unapproved.
update outreach_queue set approved = true, approved_at = coalesce(approved_at, updated_at)
  where stage in ('connect_sent', 'accepted', 'dm_sent', 'replied', 'stale');
update outreach_queue set
  flag = case stage when 'needs_review' then 'needs_review' when 'no_founder' then 'no_founder' else flag end,
  stage_since = updated_at,
  stage = case stage
    when 'new' then 'ready'
    when 'founder_found' then 'ready'
    when 'needs_review' then 'ready'
    when 'no_founder' then 'ready'
    when 'connect_sent' then 'conn_sent'
    when 'accepted' then 'connected'
    when 'dm_sent' then 'msg1'
    when 'stale' then case when dm_sent_at is not null then 'no_response' else 'expired' end
    when 'cannot_connect' then 'excluded'
    when 'skipped' then 'excluded'
  end
  where stage in ('new', 'founder_found', 'needs_review', 'no_founder', 'connect_sent', 'accepted', 'dm_sent', 'stale', 'cannot_connect', 'skipped');
update outreach_queue set verified_at = coalesce(verified_at, created_at) where verified_at is null and stage not in ('discovered', 'verifying');

alter table outreach_queue alter column stage set default 'discovered';
alter table outreach_queue add constraint outreach_queue_stage_check check (stage in (
  'discovered', 'verifying', 'ready', 'conn_sent', 'connected', 'msg1', 'fu1', 'fu2', 'replied', 'interested',
  'excluded', 'unverified', 'expired', 'no_response', 'not_interested', 'nurture'));
alter table outreach_queue drop constraint if exists outreach_queue_flag_check;
alter table outreach_queue add constraint outreach_queue_flag_check check (flag is null or flag in ('needs_review', 'no_founder'));

create index if not exists outreach_queue_approved_idx on outreach_queue (approved) where stage = 'ready';

create or replace function outreach_queue_touch() returns trigger language plpgsql as $$
begin
  if new.stage is distinct from old.stage then new.stage_since := now(); end if;
  return new;
end $$;
drop trigger if exists outreach_queue_touch_trg on outreach_queue;
create trigger outreach_queue_touch_trg before update on outreach_queue for each row execute function outreach_queue_touch();

-- ---- where each company was confirmed --------------------------------------------------------------------------------
create table if not exists outreach_source_hit (
  id bigint generated always as identity primary key,
  queue_id bigint not null references outreach_queue(id) on delete cascade,
  source text not null,                        -- s1 tracker, s2 YourStory, s3 Inc42, s4 Entrackr, s5 company or investor post
  url text, title text, article_text text,
  found_on timestamptz not null default now(),
  unique (queue_id, source)
);
create index if not exists outreach_source_hit_queue_idx on outreach_source_hit (queue_id);
alter table outreach_source_hit enable row level security;
drop policy if exists "staff read outreach_source_hit" on outreach_source_hit;
create policy "staff read outreach_source_hit" on outreach_source_hit for select to authenticated using (outreach_staff());

-- ---- replies written on the portal, sent by the extension ------------------------------------------------------------
create table if not exists outreach_outbox (
  id bigint generated always as identity primary key,
  queue_id bigint not null references outreach_queue(id) on delete cascade,
  body text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists outreach_outbox_status_idx on outreach_outbox (status);
alter table outreach_outbox enable row level security;
drop policy if exists "staff read outreach_outbox" on outreach_outbox;
create policy "staff read outreach_outbox" on outreach_outbox for select to authenticated using (outreach_staff());

-- ---- settings: rules, messages, the AI instruction -------------------------------------------------------------------
alter table outreach_settings add column if not exists config jsonb, add column if not exists templates jsonb, add column if not exists hook_prompt text;

-- ---- small helpers ---------------------------------------------------------------------------------------------------
create or replace function outreach_company_key(p_name text) returns text language sql immutable as $$
  select regexp_replace(regexp_replace(lower(btrim(coalesce(p_name, ''))), '\y(pvt|private|ltd|limited|inc|llp|technologies|technology)\y\.?', '', 'g'), '[^a-z0-9]+', '', 'g')
$$;

create or replace function outreach_stage_label(p_stage text) returns text language sql immutable as $$
  select case p_stage
    when 'discovered' then 'Discovered' when 'verifying' then 'Verifying (warming)' when 'ready' then 'Verified – to approve'
    when 'conn_sent' then 'Connection sent' when 'connected' then 'Connected' when 'msg1' then 'Message 1 sent'
    when 'fu1' then 'Follow-up 1 sent' when 'fu2' then 'Follow-up 2 sent' when 'replied' then 'Replied → Swetha'
    when 'interested' then 'Interested / call' when 'excluded' then 'Excluded (outside ICP / duplicate)'
    when 'unverified' then 'Could not verify' when 'expired' then 'Connection not accepted'
    when 'no_response' then 'No reply after full sequence' when 'not_interested' then 'Not interested' when 'nurture' then 'Not now – nurture'
    else p_stage end
$$;

create or replace function outreach_source_label(p_source text) returns text language sql immutable as $$
  select case p_source
    when 's1' then 'Open-source funding tracker' when 's2' then 'YourStory' when 's3' then 'Inc42' when 's4' then 'Entrackr'
    when 's5' then 'Company / investor post' when 'manual' then 'Added by hand' when 'import' then 'Funding dashboard import'
    else p_source end
$$;

-- One line in a company's History. Internal: not callable from the API.
create or replace function outreach_log(p_queue bigint, p_text text) returns void language sql security definer set search_path = public as $$
  insert into outreach_event (action_type, queue_id, detail) values ('note', p_queue, p_text)
$$;
revoke all on function outreach_log(bigint, text) from public, anon, authenticated;

-- ---- what the extension and the daily job call (each one checks the key) --------------------------------------------
-- Companies from the funding dashboard button. There is no round information there, so they skip verification and wait
-- in "Verified – to approve" like a hand-added lead.
create or replace function outreach_queue_import(p_key text, p_companies jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare c jsonb; nm text; k text; added int := 0; total int := 0; n int; qid bigint;
begin
  perform outreach_auth(p_key);
  for c in select * from jsonb_array_elements(coalesce(p_companies, '[]'::jsonb)) loop
    total := total + 1;
    nm := btrim(coalesce(c ->> 'name', ''));
    k := outreach_company_key(nm);
    if nm = '' or k = '' then continue; end if;
    insert into outreach_queue (company_name, company_key, website, hq, sector, total_raised_text, stage, verified_at)
    values (nm, k, nullif(c ->> 'website', ''), nullif(c ->> 'hq', ''), nullif(c ->> 'sector', ''), nullif(c ->> 'total_raised', ''), 'ready', now())
    on conflict (company_key) do nothing returning id into qid;
    get diagnostics n = row_count;
    if n > 0 then
      added := added + 1;
      insert into outreach_source_hit (queue_id, source) values (qid, 'import');
      perform outreach_log(qid, 'Imported from the funding dashboard. Needs a founder and approval.');
    end if;
  end loop;
  return jsonb_build_object('received', total, 'added', added, 'alreadyQueued', total - added, 'alreadyContacted', 0);
end $$;

-- New rounds found in Source 1 by the daily job. Existing companies are left alone.
create or replace function outreach_discover(p_key text, p_leads jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare c jsonb; nm text; k text; added int := 0; total int := 0; qid bigint;
begin
  perform outreach_auth(p_key);
  for c in select * from jsonb_array_elements(coalesce(p_leads, '[]'::jsonb)) loop
    total := total + 1;
    nm := btrim(coalesce(c ->> 'name', ''));
    k := outreach_company_key(nm);
    if nm = '' or k = '' then continue; end if;
    insert into outreach_queue (company_name, company_key, website, hq, sector, round_name, round_amount, lead_investor, investors, description, announced_on, stage)
    values (nm, k, nullif(c ->> 'website', ''), nullif(c ->> 'city', ''), nullif(c ->> 'sector', ''), nullif(c ->> 'round', ''), nullif(c ->> 'amount', ''),
            nullif(c ->> 'lead_investor', ''), nullif(c ->> 'investors', ''), nullif(c ->> 'description', ''), nullif(c ->> 'announced_on', '')::date, 'discovered')
    on conflict (company_key) do nothing returning id into qid;
    if qid is not null then
      added := added + 1;
      insert into outreach_source_hit (queue_id, source, url) values (qid, 's1', nullif(c ->> 'url', ''));
      perform outreach_log(qid, 'Found in Source 1 (open-source tracker)');
    end if;
    qid := null;
  end loop;
  return jsonb_build_object('received', total, 'added', added);
end $$;

-- Update one lead. Only the fields the bot and the daily job may change; a field is touched only if it is in p_patch.
-- A stage change, or a "log" sentence, is written to the company's History.
create or replace function outreach_queue_patch(p_key text, p_id bigint, p_patch jsonb) returns outreach_queue
language plpgsql security definer set search_path = public as $$
declare r outreach_queue; old_stage text;
begin
  perform outreach_auth(p_key);
  select stage into old_stage from outreach_queue where id = p_id;
  if not found then raise exception 'Unknown lead'; end if;
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
    fu1_sent_at = case when p_patch ? 'fu1_sent_at' then (p_patch ->> 'fu1_sent_at')::timestamptz else fu1_sent_at end,
    fu2_sent_at = case when p_patch ? 'fu2_sent_at' then (p_patch ->> 'fu2_sent_at')::timestamptz else fu2_sent_at end,
    replied_at = case when p_patch ? 'replied_at' then (p_patch ->> 'replied_at')::timestamptz else replied_at end,
    verified_at = case when p_patch ? 'verified_at' then (p_patch ->> 'verified_at')::timestamptz else verified_at end,
    reply_text = case when p_patch ? 'reply_text' then p_patch ->> 'reply_text' else reply_text end,
    reply_label = case when p_patch ? 'reply_label' then p_patch ->> 'reply_label' else reply_label end,
    hook = case when p_patch ? 'hook' then p_patch ->> 'hook' else hook end,
    flag = case when p_patch ? 'flag' then p_patch ->> 'flag' else flag end,
    already_first = case when p_patch ? 'already_first' then coalesce((p_patch ->> 'already_first')::boolean, false) else already_first end,
    round_name = case when p_patch ? 'round_name' then p_patch ->> 'round_name' else round_name end,
    round_amount = case when p_patch ? 'round_amount' then p_patch ->> 'round_amount' else round_amount end,
    lead_investor = case when p_patch ? 'lead_investor' then p_patch ->> 'lead_investor' else lead_investor end,
    investors = case when p_patch ? 'investors' then p_patch ->> 'investors' else investors end,
    description = case when p_patch ? 'description' then p_patch ->> 'description' else description end,
    last_error = case when p_patch ? 'last_error' then p_patch ->> 'last_error' else last_error end,
    attempts = attempts + case when coalesce((p_patch ->> 'bump_attempts')::boolean, false) then 1 else 0 end,
    updated_at = now()
  where id = p_id returning * into r;
  if r.stage is distinct from old_stage or (p_patch ? 'log' and coalesce(p_patch ->> 'log', '') <> '') then
    perform outreach_log(p_id, coalesce(nullif(p_patch ->> 'log', ''), 'Moved to: ' || outreach_stage_label(r.stage)));
  end if;
  return r;
end $$;

-- A confirmation from one source. Returns how many sources now confirm the round (Source 1 included).
create or replace function outreach_source_hit_add(p_key text, p_queue_id bigint, p_source text, p_url text, p_title text, p_text text) returns int
language plpgsql security definer set search_path = public as $$
declare n int; fresh boolean;
begin
  perform outreach_auth(p_key);
  insert into outreach_source_hit (queue_id, source, url, title, article_text) values (p_queue_id, p_source, p_url, p_title, left(p_text, 6000))
    on conflict (queue_id, source) do nothing;
  get diagnostics n = row_count;
  fresh := n > 0;
  if fresh then perform outreach_log(p_queue_id, 'Confirmed on ' || outreach_source_label(p_source) || ' – company, round and amount match'); end if;
  return (select count(*) from outreach_source_hit where queue_id = p_queue_id and source in ('s1', 's2', 's3', 's4', 's5'));
end $$;

create or replace function outreach_source_hits(p_key text, p_ids bigint[]) returns setof outreach_source_hit language plpgsql stable security definer set search_path = public as $$
begin
  perform outreach_auth(p_key);
  return query select * from outreach_source_hit where queue_id = any(p_ids) order by found_on;
end $$;

-- The rules, the four messages and the AI instruction, as the extension and the daily job read them.
create or replace function outreach_config_for_bot(p_key text) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform outreach_auth(p_key);
  return (select jsonb_build_object('config', config, 'templates', templates, 'hook_prompt', hook_prompt) from outreach_settings where id = 1);
end $$;

-- The next reply written on the portal, waiting to be sent from LinkedIn. Oldest first, one at a time.
create or replace function outreach_outbox_next(p_key text)
returns table (id bigint, queue_id bigint, body text, founder_name text, founder_url text, company_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform outreach_auth(p_key);
  return query select o.id, o.queue_id, o.body, q.founder_name, q.founder_url, q.company_name
    from outreach_outbox o join outreach_queue q on q.id = o.queue_id where o.status = 'pending' order by o.id limit 1;
end $$;

create or replace function outreach_outbox_done(p_key text, p_id bigint, p_ok boolean, p_error text) returns void
language plpgsql security definer set search_path = public as $$
declare q bigint;
begin
  perform outreach_auth(p_key);
  update outreach_outbox set status = case when p_ok then 'sent' else 'failed' end, error = case when p_ok then null else p_error end, sent_at = case when p_ok then now() else null end
    where id = p_id and status = 'pending' returning queue_id into q;
  if q is not null then perform outreach_log(q, case when p_ok then 'Reply sent from LinkedIn' else 'Reply could not be sent: ' || coalesce(p_error, 'unknown error') end); end if;
end $$;

revoke all on function outreach_queue_import(text, jsonb), outreach_discover(text, jsonb), outreach_queue_patch(text, bigint, jsonb),
  outreach_source_hit_add(text, bigint, text, text, text, text), outreach_source_hits(text, bigint[]), outreach_config_for_bot(text),
  outreach_outbox_next(text), outreach_outbox_done(text, bigint, boolean, text) from public;
grant execute on function outreach_queue_import(text, jsonb), outreach_discover(text, jsonb), outreach_queue_patch(text, bigint, jsonb),
  outreach_source_hit_add(text, bigint, text, text, text, text), outreach_source_hits(text, bigint[]), outreach_config_for_bot(text),
  outreach_outbox_next(text), outreach_outbox_done(text, bigint, boolean, text) to anon, authenticated;

-- ---- what the Outreach pages call (signed-in PBA staff, no key) ------------------------------------------------------
create or replace function outreach_config_get() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not outreach_staff() then raise exception 'No access'; end if;
  return (select jsonb_build_object('config', config, 'templates', templates, 'hook_prompt', hook_prompt) from outreach_settings where id = 1);
end $$;

create or replace function outreach_config_save(p_config jsonb, p_templates jsonb, p_hook_prompt text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not outreach_staff() then raise exception 'No access'; end if;
  update outreach_settings set config = p_config, templates = p_templates, hook_prompt = p_hook_prompt where id = 1;
end $$;

-- Add a lead by hand. It skips verification and waits in "Verified – to approve". With a founder (name and LinkedIn link) the
-- bot has nothing to look up; without one it finds the founder first.
drop function if exists outreach_add_lead(text, text, text, text, text, text, text, text, text);
create or replace function outreach_add_lead(
  p_company text, p_website text, p_hq text, p_sector text, p_company_url text,
  p_founder_name text, p_founder_title text, p_founder_url text,
  p_round text, p_amount text, p_lead_investor text, p_description text
) returns bigint language plpgsql security definer set search_path = public as $$
declare k text := outreach_company_key(p_company); qid bigint;
begin
  if not outreach_staff() then raise exception 'You don''t have access to this action'; end if;
  if k = '' then raise exception 'Add the company name'; end if;
  if (coalesce(btrim(p_founder_name), '') = '') <> (coalesce(btrim(p_founder_url), '') = '') then raise exception 'Give both the founder''s name and LinkedIn link, or neither'; end if;
  if exists (select 1 from outreach_queue where company_key = k) then raise exception 'This company is already in the list'; end if;
  insert into outreach_queue (company_name, company_key, website, hq, sector, linkedin_company_url, founder_name, founder_title, founder_url,
                              round_name, round_amount, lead_investor, description, stage, verified_at)
  values (btrim(p_company), k, nullif(btrim(p_website), ''), nullif(btrim(p_hq), ''), nullif(btrim(p_sector), ''), nullif(btrim(p_company_url), ''),
          nullif(btrim(p_founder_name), ''), nullif(btrim(p_founder_title), ''), nullif(btrim(p_founder_url), ''),
          nullif(btrim(p_round), ''), nullif(btrim(p_amount), ''), nullif(btrim(p_lead_investor), ''), nullif(btrim(p_description), ''), 'ready', now())
  returning id into qid;
  insert into outreach_source_hit (queue_id, source) values (qid, 'manual');
  perform outreach_log(qid, 'Added by hand. Needs approval' || case when p_founder_url is null or btrim(p_founder_url) = '' then ' and a founder lookup.' else '.' end);
  return qid;
end $$;

-- "Fix this lead": give the bot the founder it could not find. Any lead that has not been contacted yet.
create or replace function outreach_give_founder(p_id bigint, p_founder_url text, p_founder_name text, p_founder_title text, p_company_url text)
returns void language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not outreach_staff() then raise exception 'You don''t have access to this action'; end if;
  update outreach_queue set
    flag = null, founder_url = p_founder_url, founder_name = p_founder_name, founder_title = nullif(p_founder_title, ''),
    linkedin_company_url = coalesce(nullif(p_company_url, ''), linkedin_company_url), last_error = null, updated_at = now()
  where id = p_id and stage in ('discovered', 'verifying', 'ready');
  get diagnostics n = row_count;
  if n = 0 then raise exception 'This lead has already moved on'; end if;
  perform outreach_log(p_id, 'Founder set by hand: ' || p_founder_name);
end $$;

-- Everything else staff do to a lead, in one place. p_args carries what the action needs.
create or replace function outreach_act(p_action text, p_id bigint, p_args jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare q outreach_queue; n int := 0; nid bigint; t text := btrim(coalesce(p_args ->> 'text', '')); key text; ref int;
begin
  if not outreach_staff() then raise exception 'You don''t have access to this action'; end if;

  if p_action = 'approve_all' then
    with u as (update outreach_queue set approved = true, approved_at = now(), approved_by = auth.uid()
      where stage = 'ready' and not approved returning id),
    l as (insert into outreach_event (action_type, queue_id, detail) select 'note', id, 'Approved – will send in the next sending window' from u returning 1)
    select count(*) into n from l;
    return jsonb_build_object('count', n);
  end if;

  select * into q from outreach_queue where id = p_id;
  if not found then raise exception 'Unknown lead'; end if;

  case p_action
    when 'approve' then
      if q.stage <> 'ready' then raise exception 'Only a verified company can be approved'; end if;
      update outreach_queue set approved = true, approved_at = now(), approved_by = auth.uid() where id = p_id;
      perform outreach_log(p_id, 'Approved – will send in the next sending window');
    when 'pause' then
      update outreach_queue set paused = true where id = p_id; perform outreach_log(p_id, 'Automation paused');
    when 'resume' then
      update outreach_queue set paused = false where id = p_id; perform outreach_log(p_id, 'Automation resumed');
    when 'exclude' then
      if q.stage not in ('discovered', 'verifying', 'ready') then raise exception 'Only a company that has not been contacted can be excluded'; end if;
      update outreach_queue set stage = 'excluded' where id = p_id; perform outreach_log(p_id, 'Closed: ' || outreach_stage_label('excluded') || ' (by hand)');
    when 'mark_replied' then
      if q.stage not in ('conn_sent', 'connected', 'msg1', 'fu1', 'fu2') then raise exception 'This company is not in the outreach sequence'; end if;
      if t = '' then raise exception 'Paste the reply they sent'; end if;
      update outreach_queue set stage = 'replied', replied_at = now(), reply_text = t, reply_label = null where id = p_id;
      perform outreach_log(p_id, 'Reply logged by hand – sequence stopped. Sent to the reply queue.');
    when 'set_hook' then
      update outreach_queue set hook = t where id = p_id;
      perform outreach_log(p_id, case when p_args ? 'ai' then 'AI line written from the articles' else 'AI line edited by hand' end);
    when 'set_override' then
      key := p_args ->> 'key';
      if key not in ('note', 'm1', 'f1', 'f2') then raise exception 'Unknown message'; end if;
      update outreach_queue set overrides = overrides || jsonb_build_object(key, p_args ->> 'text') where id = p_id;
      perform outreach_log(p_id, 'Message edited by hand: ' || key);
    when 'clear_override' then
      update outreach_queue set overrides = overrides - (p_args ->> 'key') where id = p_id;
    when 'set_label' then
      update outreach_queue set reply_label = nullif(t, '') where id = p_id;
    when 'confirm_source' then
      key := coalesce(p_args ->> 'source', 's5');
      if key not in ('s2', 's3', 's4', 's5') then raise exception 'Unknown source'; end if;
      insert into outreach_source_hit (queue_id, source, url, title) values (p_id, key, nullif(btrim(p_args ->> 'url'), ''), 'Confirmed by hand')
        on conflict (queue_id, source) do nothing;
      perform outreach_log(p_id, 'Confirmed by hand on ' || outreach_source_label(key));
    when 'close' then
      key := p_args ->> 'to';
      if key not in ('interested', 'nurture', 'not_interested') then raise exception 'Unknown outcome'; end if;
      if q.stage <> 'replied' and not (q.stage = 'interested' and key <> 'interested') then raise exception 'Only a company that replied can be closed this way'; end if;
      update outreach_queue set stage = key where id = p_id;
      perform outreach_log(p_id, case key
        when 'interested' then 'Marked interested – call to be booked'
        when 'nurture' then 'Not now – nurture. Re-check in 90 days or at the next funding news'
        else 'Not interested – closed, never contact again' end);
    when 'queue_reply' then
      if q.stage not in ('replied', 'interested', 'nurture') then raise exception 'There is no reply to answer'; end if;
      if t = '' then raise exception 'Write the reply first'; end if;
      insert into outreach_outbox (queue_id, body, created_by) values (p_id, t, auth.uid());
      perform outreach_log(p_id, 'Reply queued to send: "' || left(t, 70) || case when length(t) > 70 then '…' else '' end || '"');
    when 'refer' then
      if q.stage <> 'replied' then raise exception 'Only a company that replied can be referred on'; end if;
      if t = '' then raise exception 'Who did they refer you to?'; end if;
      select count(*) + 1 into ref from outreach_queue where referred_from = p_id;
      insert into outreach_queue (company_name, company_key, website, hq, sector, total_raised_text, round_name, round_amount, lead_investor, investors, description, announced_on, hook,
                                  founder_name, founder_title, stage, verified_at, referred_from)
      values (q.company_name, q.company_key || '~r' || ref, q.website, q.hq, q.sector, q.total_raised_text, q.round_name, q.round_amount, q.lead_investor, q.investors, q.description, q.announced_on, q.hook,
              t, 'Referred contact', 'ready', now(), p_id) returning id into nid;
      insert into outreach_source_hit (queue_id, source) values (nid, 'manual');
      perform outreach_log(nid, 'Created from referral by ' || coalesce(q.founder_name, 'the founder') || '. Needs approval and a LinkedIn lookup.');
      update outreach_queue set stage = 'nurture' where id = p_id;
      perform outreach_log(p_id, 'Referred to ' || t || ' – new contact created');
      return jsonb_build_object('id', nid);
    else raise exception 'Unknown action';
  end case;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function outreach_config_get(), outreach_config_save(jsonb, jsonb, text),
  outreach_add_lead(text, text, text, text, text, text, text, text, text, text, text, text),
  outreach_give_founder(bigint, text, text, text, text), outreach_act(text, bigint, jsonb) from public, anon;
grant execute on function outreach_config_get(), outreach_config_save(jsonb, jsonb, text),
  outreach_add_lead(text, text, text, text, text, text, text, text, text, text, text, text),
  outreach_give_founder(bigint, text, text, text, text), outreach_act(text, bigint, jsonb) to authenticated;

commit;
