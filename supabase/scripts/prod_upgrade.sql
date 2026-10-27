-- ============================================================================================================
-- PBL Advisory — PRODUCTION UPGRADE  (project gugpmbzjjvoiyvgeuvjo ONLY. Never run this on the dev project.)
--
-- What it does: brings the production database up to the current code, structure only.
--   * adds tables, columns, functions and rules that production does not have yet
--   * deletes nothing, changes no existing row, copies no data from dev, creates no test company or test person
--   * safe to run more than once (create ... if not exists, drop policy/trigger if exists before create)
-- What it leaves out on purpose: the dev-only test tools (20261028_dev_tools) and every seed script.
-- The only rows it inserts are the Legal price list (legal_type), which is configuration the Legal page needs, with
-- ON CONFLICT DO NOTHING. Legal numbering (request, receipt, invoice) starts at 1 in production.
--
-- Run it in the SQL editor of the PRODUCTION project, as one script. Nothing has been run by Claude.
-- ============================================================================================================

begin;

-- ============ A. Typed figures beside each uploaded file (file_summary)  — from 20261023 ============
-- The 2-4 figures a person types when they upload a document (opening balance, GSTR-3B tax paid...). Shown in the side panel.
create table if not exists file_summary (
  company_id uuid not null references company(id) on delete cascade,
  req_key text not null,
  period_key text not null default '',          -- '' for once-only documents, 'YYYY-MM' for monthly ones
  field text not null,
  value text,
  entered_by_name text,
  entered_at timestamptz not null default now(),
  primary key (company_id, req_key, period_key, field)
);
alter table file_summary enable row level security;
drop policy if exists "read my companies" on file_summary;
create policy "read my companies" on file_summary for select to authenticated using (company_id in (select my_company_ids()));
drop policy if exists "members write file_summary" on file_summary;
create policy "members write file_summary" on file_summary for insert to authenticated with check (company_id = (select company_id from current_app_user()));
drop policy if exists "members update file_summary" on file_summary;
create policy "members update file_summary" on file_summary for update to authenticated using (company_id = (select company_id from current_app_user()));

-- ============ B. Monthly close state and verified filings (month, filing_verify)  — from 20261024 ============
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
    execute format('drop policy if exists "read my companies" on %I', t);
    execute format('create policy "read my companies" on %I for select to authenticated using (company_id in (select my_company_ids()))', t);
    execute format('drop policy if exists "members write" on %I', t);
    execute format('create policy "members write" on %I for insert to authenticated with check (company_id = (select company_id from current_app_user()))', t);
    execute format('drop policy if exists "members update" on %I', t);
    execute format('create policy "members update" on %I for update to authenticated using (company_id = (select company_id from current_app_user()))', t);
  end loop;
end $$;

-- ============ C. MIS template v1.1 columns on period_figures  — from 20261025 ============
-- MIS template v1.1: the figures the dashboard's taxes, team and expense sections need. All nullable, so months published from
-- a v1.0 workbook stay as they are and the dashboard shows "not in the workbook yet" for them instead of a zero.
alter table period_figures
  add column if not exists gst_output numeric, add column if not exists gst_itc numeric, add column if not exists gst_paid_cash numeric,
  add column if not exists igst numeric, add column if not exists cgst numeric, add column if not exists sgst numeric,
  add column if not exists tds_salary numeric, add column if not exists tds_vendor numeric, add column if not exists tds_rent numeric,
  add column if not exists pt_paid numeric, add column if not exists interest_fees numeric, add column if not exists interest_note text,
  add column if not exists employees numeric, add column if not exists contractors numeric, add column if not exists notices_open numeric,
  add column if not exists exp_salaries numeric, add column if not exists exp_contractors numeric, add column if not exists exp_cloud numeric,
  add column if not exists exp_marketing numeric, add column if not exists exp_rent numeric, add column if not exists exp_travel numeric,
  add column if not exists exp_software numeric, add column if not exists exp_other numeric;

-- ============ D. Legal: requests, payments, rules, price list  — from 20261026 ============
-- Build 5 · Legal (spec 09). Prices are before GST. A paid price never changes when the price list changes: it is copied onto the request.
-- Every rule in the spec is enforced here, in the database, not only in the screens: the guard trigger below refuses any status change a
-- role is not allowed to make, and a request moves to "In progress" only through legal_confirm_order() after a confirmed payment.

create table if not exists legal_type (
  id text primary key, kind text not null check (kind in ('draft','review')), name text not null,
  price numeric, quote_from numeric, days int, pages_covered int, unit_note text,
  what_it_is text, when_needed text, what_you_get text, sort int not null default 0, active boolean not null default true
);

create sequence if not exists legal_request_seq start 1;
create sequence if not exists legal_receipt_seq start 1;
create sequence if not exists legal_invoice_seq start 1;

create table if not exists legal_request (
  id text primary key default ('L-' || lpad(nextval('legal_request_seq')::text, 4, '0')),
  company_id uuid not null references company(id) on delete cascade,
  type_id text not null references legal_type(id),
  title text not null, party text, need text, needed_by date,
  created_by uuid, created_by_name text, created_by_role text, created_at timestamptz not null default now(),
  status text not null default 'pay' check (status in ('quote','pay','progress','extra','done')),
  pages int,
  price numeric,                                   -- the price paid, copied here and never changed afterwards
  quote_amount numeric, quote_note text, quoted_by_name text, quoted_at timestamptz,
  ready_path text, ready_filename text, ready_at timestamptz,
  delivered_at timestamptz, findings jsonb, final_invoice_no text
);
create index if not exists legal_request_company on legal_request(company_id, created_at desc);

create table if not exists legal_file (
  id uuid primary key default gen_random_uuid(), request_id text not null references legal_request(id) on delete cascade,
  storage_path text not null, filename text not null, pages int, by_name text, at timestamptz not null default now()
);
create table if not exists legal_extra (
  id uuid primary key default gen_random_uuid(), request_id text not null references legal_request(id) on delete cascade,
  what text not null, amount numeric not null check (amount > 0), reason text not null, by_name text, at timestamptz not null default now(),
  status text not null default 'proposed' check (status in ('proposed','approved','withdrawn')), approved_at timestamptz
);
create table if not exists legal_note (
  id uuid primary key default gen_random_uuid(), request_id text not null references legal_request(id) on delete cascade,
  by_name text, by_role text, at timestamptz not null default now(), text text not null
);
-- A payment attempt. It is only ever marked paid by legal_confirm_order(): the gateway's own callback in production, or the built-in
-- test gateway (clearly labelled, no money moves) while no gateway keys are configured.
create table if not exists legal_order (
  id uuid primary key default gen_random_uuid(), request_id text not null references legal_request(id) on delete cascade,
  company_id uuid not null, purpose text not null check (purpose in ('advance','extra')), amount numeric not null, gst numeric not null,
  gateway text not null check (gateway in ('test','razorpay')), gateway_order_id text, status text not null default 'created' check (status in ('created','paid','failed')),
  created_by uuid, created_at timestamptz not null default now()
);
create table if not exists legal_payment (
  id uuid primary key default gen_random_uuid(), request_id text not null references legal_request(id) on delete cascade, order_id uuid references legal_order(id),
  what text not null check (what in ('advance','extra')), amount numeric not null, gst numeric not null, gateway text not null, gateway_ref text not null unique,
  receipt_no text not null, paid_at timestamptz not null default now()
);

alter table legal_type enable row level security; alter table legal_request enable row level security; alter table legal_file enable row level security;
alter table legal_extra enable row level security; alter table legal_note enable row level security; alter table legal_order enable row level security; alter table legal_payment enable row level security;

create or replace function legal_role() returns text language sql stable security definer set search_path = public as $$ select role from current_app_user() limit 1 $$;
create or replace function legal_member(c uuid) returns boolean language sql stable security definer set search_path = public as $$
  select c in (select my_company_ids()) and coalesce(legal_role(), '') <> 'practitioner' $$;      -- an external practitioner never sees Legal

drop policy if exists "read legal types" on legal_type;
create policy "read legal types" on legal_type for select to authenticated using (coalesce(legal_role(), '') <> 'practitioner');
drop policy if exists "admin edits legal types" on legal_type;
create policy "admin edits legal types" on legal_type for update to authenticated using (is_platform_admin()) with check (is_platform_admin());
drop policy if exists "read requests" on legal_request;
create policy "read requests" on legal_request for select to authenticated using (legal_member(company_id));
drop policy if exists "create requests" on legal_request;
create policy "create requests" on legal_request for insert to authenticated with check (legal_member(company_id) and company_id = (select company_id from current_app_user()) and status in ('quote','pay'));
drop policy if exists "update requests" on legal_request;
create policy "update requests" on legal_request for update to authenticated using (legal_member(company_id)) with check (legal_member(company_id));
drop policy if exists "read files" on legal_file;
create policy "read files" on legal_file for select to authenticated using (exists (select 1 from legal_request r where r.id = request_id and legal_member(r.company_id)));
drop policy if exists "add files" on legal_file;
create policy "add files" on legal_file for insert to authenticated with check (exists (select 1 from legal_request r where r.id = request_id and legal_member(r.company_id)));
drop policy if exists "read extras" on legal_extra;
create policy "read extras" on legal_extra for select to authenticated using (exists (select 1 from legal_request r where r.id = request_id and legal_member(r.company_id)));
drop policy if exists "pba proposes extras" on legal_extra;
create policy "pba proposes extras" on legal_extra for insert to authenticated with check (legal_role() = 'pba' and exists (select 1 from legal_request r where r.id = request_id and legal_member(r.company_id)));
drop policy if exists "read notes" on legal_note;
create policy "read notes" on legal_note for select to authenticated using (exists (select 1 from legal_request r where r.id = request_id and legal_member(r.company_id)));
drop policy if exists "add notes" on legal_note;
create policy "add notes" on legal_note for insert to authenticated with check (exists (select 1 from legal_request r where r.id = request_id and legal_member(r.company_id)));
drop policy if exists "read orders" on legal_order;
create policy "read orders" on legal_order for select to authenticated using (legal_member(company_id));
drop policy if exists "founder or admin starts a payment" on legal_order;
create policy "founder or admin starts a payment" on legal_order for insert to authenticated with check (legal_member(company_id) and (legal_role() = 'founder' or is_platform_admin()) and status = 'created');
drop policy if exists "read payments" on legal_payment;
create policy "read payments" on legal_payment for select to authenticated using (exists (select 1 from legal_request r where r.id = request_id and legal_member(r.company_id)));

-- Status changes: who may make which, and nothing else.
create or replace function legal_request_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare r text := legal_role(); confirming boolean := coalesce(current_setting('legal.confirm', true), '') = 'on';
begin
  if confirming then return new; end if;
  if r is distinct from 'pba' then
    if (new.price, new.quote_amount, new.status, new.ready_path, new.delivered_at, new.final_invoice_no, new.findings) is distinct from (old.price, old.quote_amount, old.status, old.ready_path, old.delivered_at, old.final_invoice_no, old.findings) then
      raise exception 'Only Prime Bottomline can price, finish or deliver a legal request';
    end if;
    return new;
  end if;
  if new.price is distinct from old.price then raise exception 'A paid price never changes'; end if;
  if new.status is distinct from old.status then
    if old.status = 'quote' and new.status = 'pay' then
      if coalesce(new.quote_amount, 0) <= 0 then raise exception 'Send a price first'; end if;
    elsif old.status = 'progress' and new.status = 'extra' then
      if new.ready_path is null then raise exception 'Upload the finished document before proposing extra work'; end if;
      if not exists (select 1 from legal_extra where request_id = new.id and status = 'proposed') then raise exception 'There is no extra work to approve'; end if;
    elsif old.status = 'progress' and new.status = 'done' then
      if new.ready_path is null then raise exception 'Upload the finished document before delivering'; end if;
      if exists (select 1 from legal_extra where request_id = new.id and status = 'proposed') then raise exception 'Extra work is waiting for the founder''s approval'; end if;
      new.delivered_at := now(); new.final_invoice_no := 'PBA/' || to_char(now(), 'YY') || '-' || to_char(now() + interval '1 year', 'YY') || '/' || lpad(nextval('legal_invoice_seq')::text, 4, '0');
    else raise exception 'That change of status is not allowed (% to %)', old.status, new.status; end if;
  end if;
  return new;
end $$;
drop trigger if exists legal_request_guard_t on legal_request;
create trigger legal_request_guard_t before update on legal_request for each row execute function legal_request_guard();


-- A new request is priced by the list, never by the browser: a fixed price only when the type has one and the file fits its pages.
create or replace function legal_request_insert_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare t legal_type%rowtype;
begin
  select * into t from legal_type where id = new.type_id and active;
  if not found then raise exception 'Unknown document type'; end if;
  new.price := null; new.ready_path := null; new.delivered_at := null; new.final_invoice_no := null; new.findings := null; new.quoted_at := null; new.quoted_by_name := null; new.quote_note := null;
  if t.price is not null and (t.pages_covered is null or coalesce(new.pages, 0) between 1 and t.pages_covered) then
    new.status := 'pay'; new.quote_amount := t.price;
  else
    new.status := 'quote'; new.quote_amount := null;
  end if;
  return new;
end $$;
drop trigger if exists legal_request_insert_guard_t on legal_request;
create trigger legal_request_insert_guard_t before insert on legal_request for each row execute function legal_request_insert_guard();

-- A payment is always for exactly what is owed: the quoted price, or the extra work waiting for approval. GST is added here, at 18%.
create or replace function legal_order_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare req legal_request%rowtype; owed numeric;
begin
  select * into req from legal_request where id = new.request_id;
  if not found or req.company_id <> new.company_id then raise exception 'Unknown request'; end if;
  if new.purpose = 'advance' then
    if req.status <> 'pay' then raise exception 'This request is not waiting for payment'; end if;
    owed := req.quote_amount;
  else
    if req.status <> 'extra' then raise exception 'There is no extra work to pay for'; end if;
    select coalesce(sum(amount), 0) into owed from legal_extra where request_id = req.id and status = 'proposed';
  end if;
  if owed is null or owed <= 0 then raise exception 'Nothing is owed on this request'; end if;
  new.amount := owed; new.gst := round(owed * 0.18, 2); new.status := 'created';
  update legal_order set status = 'failed' where request_id = new.request_id and status = 'created' and purpose = new.purpose;   -- one live attempt at a time
  return new;
end $$;
drop trigger if exists legal_order_guard_t on legal_order;
create trigger legal_order_guard_t before insert on legal_order for each row execute function legal_order_guard();

-- Confirming a payment. Production: called with the gateway's service credentials after its signed callback. Built-in test gateway: the
-- founder or admin confirms their own test order. A request starts work only here.
create or replace function legal_confirm_order(p_order uuid, p_ref text) returns void language plpgsql security definer set search_path = public as $$
declare o legal_order%rowtype; req legal_request%rowtype; svc boolean := coalesce(auth.role(), '') = 'service_role'; rc text;
begin
  select * into o from legal_order where id = p_order for update;
  if not found then raise exception 'Unknown payment'; end if;
  if o.status = 'paid' then return; end if;
  if not svc then
    if o.gateway <> 'test' then raise exception 'This payment is confirmed by the gateway, not by the browser'; end if;
    if not (legal_member(o.company_id) and (legal_role() = 'founder' or is_platform_admin())) then raise exception 'Only the founder can pay'; end if;
  end if;
  perform set_config('legal.confirm', 'on', true);
  rc := 'PBA/' || to_char(now(), 'YY') || '-' || to_char(now() + interval '1 year', 'YY') || '/L-' || lpad(nextval('legal_receipt_seq')::text, 4, '0');
  update legal_order set status = 'paid' where id = o.id;
  insert into legal_payment (request_id, order_id, what, amount, gst, gateway, gateway_ref, receipt_no) values (o.request_id, o.id, o.purpose, o.amount, o.gst, o.gateway, p_ref, rc);
  select * into req from legal_request where id = o.request_id for update;
  if o.purpose = 'advance' then
    update legal_request set status = 'progress', price = o.amount where id = req.id and status in ('pay', 'quote');
  else
    update legal_extra set status = 'approved', approved_at = now() where request_id = req.id and status = 'proposed';
    update legal_request set status = 'done', delivered_at = now(), final_invoice_no = 'PBA/' || to_char(now(), 'YY') || '-' || to_char(now() + interval '1 year', 'YY') || '/' || lpad(nextval('legal_invoice_seq')::text, 4, '0') where id = req.id and status = 'extra';
  end if;
  perform set_config('legal.confirm', 'off', true);
end $$;
grant execute on function legal_confirm_order(uuid, text) to authenticated, service_role;

-- The finished document stays locked until it is delivered: only Prime Bottomline can read it before then, and an external practitioner never can.
drop policy if exists "legal finished documents are locked until delivered" on storage.objects;
create policy "legal finished documents are locked until delivered" on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'docs' or (storage.foldername(name))[2] <> 'legal-out'
         or legal_role() = 'pba'
         or (legal_role() = 'founder' and exists (select 1 from legal_request r where r.id = (storage.foldername(name))[3] and r.company_id::text = (storage.foldername(name))[1] and r.status = 'done')));

insert into legal_type (id, kind, name, price, quote_from, days, pages_covered, unit_note, what_it_is, when_needed, what_you_get, sort) values
  ('nda', 'draft', 'Non-disclosure agreement (NDA)', 3000, null, 2, null, null, 'A short agreement that stops the other side from sharing or using what you tell them.', 'Before you share numbers, code or plans with a possible client, partner, vendor or investor.', 'A ready-to-sign NDA, mutual or one-way, in Word and PDF.', 0),
  ('offer', 'draft', 'Offer letter', 2000, null, 1, null, null, 'The letter that offers someone a job: role, pay, joining date and the main conditions.', 'When you have agreed terms with a new hire and want it in writing.', 'An offer letter on your letterhead, ready to send.', 1),
  ('emp', 'draft', 'Employment agreement', 6000, null, 3, null, null, 'The full contract with an employee — duties, notice, confidentiality and who owns the work they create.', 'For every full-time hire. Investors check that the company owns what employees build.', 'An agreement with confidentiality and IP assignment built in.', 2),
  ('cons', 'draft', 'Consultant or contractor agreement', 5000, null, 3, null, null, 'A contract with someone who works for you but is not on payroll.', 'Before a freelancer, consultant or agency starts work.', 'An agreement covering scope, fees, TDS, confidentiality and IP.', 3),
  ('msa', 'draft', 'Client service agreement (MSA and SOW)', 15000, null, 5, null, null, 'Your standard contract with clients: the master terms, plus a short statement of work for each project.', 'When you want clients to sign your paper instead of theirs.', 'A master agreement and an SOW template you can reuse.', 4),
  ('rev', 'draft', 'Revenue-share or channel partner agreement', 12000, null, 5, null, null, 'A contract with a partner who brings clients and takes a share or commission.', 'Before a partner introduces any client — so who owns the client and for how long is clear.', 'An agreement with clear attribution, share, duration and exit terms.', 5),
  ('br', 'draft', 'Board resolution', 1500, null, 1, null, null, 'A formal decision of the board, signed and certified.', 'Opening a bank account, appointing an auditor, approving a loan, changing signatories.', 'A certified resolution ready for the bank or the Registrar.', 6),
  ('egm', 'draft', 'Shareholder resolution and EGM notice', 4000, null, 2, null, null, 'The notice and resolution for decisions only shareholders can take.', 'Raising capital, changing the AOA, issuing shares or ESOPs.', 'Notice, explanatory statement and resolution, in the right format.', 7),
  ('esop', 'draft', 'ESOP grant letter', 4000, null, 2, null, 'Covers one employee. Each additional letter is ₹1,000.', 'The letter that grants options to an employee under your ESOP scheme.', 'Each time options are granted. Needs an approved ESOP scheme first.', 'Grant letters with the number of options, price and vesting.', 8),
  ('tc', 'draft', 'Website terms and privacy policy', 10000, null, 5, null, null, 'The terms users agree to, and how you collect and use their data.', 'Before launch, and whenever you start collecting new kinds of personal data.', 'Terms of use and a privacy policy written for your product.', 9),
  ('notice', 'draft', 'Reply to a legal notice', null, 8000, 3, null, null, 'A formal reply to a notice someone has sent the company.', 'As soon as a notice arrives — replies usually have a deadline.', 'A reply on letterhead and a short note on what happens next.', 10),
  ('dother', 'draft', 'Something else', null, 3000, null, null, null, 'Any other document you need drafted.', 'Describe what you need and we will price it.', 'Priced after we understand the scope.', 11),
  ('rnda', 'review', 'NDA review', 2000, null, 1, 8, null, 'We read an NDA someone else sent you and flag what to push back on.', 'Before you sign an NDA drafted by the other side.', 'Marked-up copy and a short list of changes to ask for.', 12),
  ('rmsa', 'review', 'Client contract or MSA review', 8000, null, 3, 20, null, 'We read a contract a client wants you to sign and flag the risks.', 'Before signing any client paper — especially liability, payment terms and termination.', 'Marked-up copy, a risk summary in plain English, and suggested wording.', 13),
  ('rvend', 'review', 'Vendor or supplier contract review', 6000, null, 3, 15, null, 'We review a contract with someone you are buying from.', 'Before committing to software, hosting, office or service contracts.', 'Marked-up copy and a risk summary.', 14),
  ('rlease', 'review', 'Lease or rental agreement review', 5000, null, 2, 15, null, 'We review an office or property lease before you sign.', 'New office, renewal or expansion.', 'Marked-up copy, with lock-in, escalation and deposit terms checked.', 15),
  ('rrev', 'review', 'Revenue-share or partner agreement review', 8000, null, 3, 15, null, 'We review a partner''s agreement that takes a share of your revenue.', 'Before signing — these often reach further than they look.', 'Marked-up copy, with attribution and duration flagged.', 16),
  ('rts', 'review', 'Term sheet review', 15000, null, 3, 10, null, 'We review an investor term sheet and explain each term.', 'As soon as you receive a term sheet, before you negotiate.', 'A plain-English note on every term and what is standard.', 17),
  ('rsha', 'review', 'Investment agreements (SHA and SSA) review', 40000, null, 7, 60, null, 'We review the shareholders and subscription agreements for a round.', 'After the term sheet, before signing the definitive agreements.', 'Marked-up copies and a negotiation list.', 18),
  ('rother', 'review', 'Something else', null, 3000, null, null, null, 'Any other document you want reviewed.', 'Upload it and we will price it.', 'Priced after we see the document.', 19)
on conflict (id) do nothing;

-- The creator of a payment attempt may attach the gateway's order id to it while it is still open; nothing else about it can be changed by a user.
drop policy if exists "set gateway order id" on legal_order;
create policy "set gateway order id" on legal_order for update to authenticated
  using (created_by = my_app_user_id() and status = 'created') with check (created_by = my_app_user_id() and status = 'created');

-- ============ E. PBA staff may submit a month when Prime Bottomline closes the books  — from 20261027 ============
-- When Prime Bottomline closes the books (company master step 2), PBA staff read the MIS workbook and submit the month, so they need the
-- same rights on the workbook records and draft figures that an external practitioner has. Publishing still needs a different person
-- (the published_not_submitter constraint), and a founder gets none of this.
drop policy if exists "pba insert mis_upload" on mis_upload;
create policy "pba insert mis_upload" on mis_upload for insert to authenticated
  with check (company_id = (select company_id from current_app_user()) and (select role from current_app_user()) = 'pba');
drop policy if exists "pba delete own mis_upload" on mis_upload;
create policy "pba delete own mis_upload" on mis_upload for delete to authenticated
  using (company_id = (select company_id from current_app_user()) and (select role from current_app_user()) = 'pba');
drop policy if exists "pba insert period_figures" on period_figures;
create policy "pba insert period_figures" on period_figures for insert to authenticated
  with check (company_id = (select company_id from current_app_user()) and (select role from current_app_user()) = 'pba');
drop policy if exists "pba update draft period_figures" on period_figures;
create policy "pba update draft period_figures" on period_figures for update to authenticated
  using (company_id = (select company_id from current_app_user()) and (select role from current_app_user()) = 'pba' and state = 'draft')
  with check (company_id = (select company_id from current_app_user()) and (select role from current_app_user()) = 'pba');
drop policy if exists "pba delete draft period_figures" on period_figures;
create policy "pba delete draft period_figures" on period_figures for delete to authenticated
  using (company_id = (select company_id from current_app_user()) and (select role from current_app_user()) = 'pba' and state <> 'published');

commit;
