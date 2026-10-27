-- TEST-COMPANY TOOLS (dev only). Two functions that clear and re-seed a company whose name contains "(test)". They refuse any other
-- company, and any caller who is not Prime Bottomline staff on that company, so they are inert on production data. Run on dev only.

create or replace function dev_guard(p uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from company where id = p and name ilike '%(test)%') then raise exception 'Only a test company can be reset or filled'; end if;
  if p not in (select my_company_ids()) or coalesce(legal_role(), '') <> 'pba' then raise exception 'Only Prime Bottomline staff on this company can do that'; end if;
end $$;

create or replace function dev_reset_company(p uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  perform dev_guard(p);
  perform set_config('legal.confirm', 'on', true);
  delete from legal_request where company_id = p;                 -- files, extras, notes, orders and payments go with it
  delete from file_summary where company_id = p;
  delete from file_version where company_id = p;
  delete from filing_verify where company_id = p;
  delete from month where company_id = p;
  delete from period_figures where company_id = p;
  delete from mis_upload where company_id = p;
  delete from master_log where company_id = p;
  delete from company_master where company_id = p;
  update company set tracking_start = null where id = p;
  perform set_config('legal.confirm', 'off', true);
end $$;

-- Six legal requests in every state the page can show. Returns the storage paths it refers to, so the app can put a placeholder file at each.
create or replace function dev_seed_legal(p uuid, founder_name text default 'Test Founder', pba_name text default 'Prime Bottomline') returns setof text language plpgsql security definer set search_path = public as $$
declare r text; inv text;
begin
  perform dev_guard(p);
  perform set_config('legal.confirm', 'on', true);
  delete from legal_request where company_id = p;

  -- 1. Delivered NDA
  insert into legal_request (company_id, type_id, title, party, need, needed_by, created_by_name, created_by_role, created_at) values (p, 'nda', 'Mutual NDA — Orbit Logistics', 'Orbit Logistics', 'Mutual NDA before a pilot discussion.', current_date - 60, founder_name, 'founder', now() - interval '70 days') returning id into r;
  update legal_request set status = 'done', price = 3000, ready_path = p || '/legal-out/' || r || '/nda-orbit-logistics.pdf', ready_filename = 'nda-orbit-logistics.pdf', ready_at = now() - interval '66 days', delivered_at = now() - interval '66 days', final_invoice_no = 'PBA/26-27/' || lpad(nextval('legal_invoice_seq')::text, 4, '0') where id = r;
  insert into legal_payment (request_id, what, amount, gst, gateway, gateway_ref, receipt_no, paid_at) values (r, 'advance', 3000, 540, 'test', 'SAMPLE-' || r || 'a', 'PBA/26-27/L-' || lpad(nextval('legal_receipt_seq')::text, 4, '0'), now() - interval '70 days');
  return next p || '/legal-out/' || r || '/nda-orbit-logistics.pdf';

  -- 2. Delivered review with an approved extra and findings
  insert into legal_request (company_id, type_id, title, party, need, needed_by, created_by_name, created_by_role, pages, created_at) values (p, 'rmsa', 'Client MSA — Northwind Retail', 'Northwind Retail', 'Their standard MSA. Worried about the liability clause and 90-day payment terms.', current_date - 35, founder_name, 'founder', 26, now() - interval '45 days') returning id into r;
  update legal_request set quote_amount = 11000, quote_note = '26 pages, plus a data-protection schedule — above the 20 pages the standard price covers.', quoted_by_name = pba_name, quoted_at = now() - interval '44 days' where id = r;
  insert into legal_file (request_id, storage_path, filename, pages, by_name) values (r, p || '/legal-in/northwind-msa-v3.pdf', 'northwind-msa-v3.pdf', 26, founder_name);
  return next p || '/legal-in/northwind-msa-v3.pdf';
  insert into legal_extra (request_id, what, amount, reason, by_name, status, approved_at, at) values (r, 'Second round of review', 3000, 'The client sent back their own changes to our mark-up; reviewed and replied clause by clause.', pba_name, 'approved', now() - interval '30 days', now() - interval '31 days');
  update legal_request set status = 'done', price = 11000, ready_path = p || '/legal-out/' || r || '/northwind-msa-reviewed.pdf', ready_filename = 'northwind-msa-reviewed.pdf', ready_at = now() - interval '31 days', delivered_at = now() - interval '30 days',
    findings = '[{"level":"High","text":"Clause 12.3 — liability is unlimited. Ask for a cap at 12 months of fees."},{"level":"High","text":"Clause 7.1 — payment in 90 days. Ask for 30; the client agreed to 45."},{"level":"Medium","text":"Clause 15 — client can end the contract at 7 days'' notice without paying for work done."},{"level":"Low","text":"Schedule B — data-protection terms are fine as drafted."}]'::jsonb,
    final_invoice_no = 'PBA/26-27/' || lpad(nextval('legal_invoice_seq')::text, 4, '0') where id = r;
  insert into legal_payment (request_id, what, amount, gst, gateway, gateway_ref, receipt_no, paid_at) values
    (r, 'advance', 11000, 1980, 'test', 'SAMPLE-' || r || 'a', 'PBA/26-27/L-' || lpad(nextval('legal_receipt_seq')::text, 4, '0'), now() - interval '44 days'),
    (r, 'extra', 3000, 540, 'test', 'SAMPLE-' || r || 'b', 'PBA/26-27/L-' || lpad(nextval('legal_receipt_seq')::text, 4, '0'), now() - interval '30 days');
  insert into legal_note (request_id, by_name, by_role, text, at) values
    (r, pba_name, 'pba', 'Sent the first mark-up. Two points need your call: the liability cap and payment terms.', now() - interval '42 days'),
    (r, founder_name, 'founder', 'Go with a 12-month cap. On payment terms we can live with 45 days.', now() - interval '41 days');
  return next p || '/legal-out/' || r || '/northwind-msa-reviewed.pdf';

  -- 3. In progress
  insert into legal_request (company_id, type_id, title, party, need, needed_by, created_by_name, created_by_role, created_at) values (p, 'cons', 'Consultant agreement — GTM partner, Mumbai', 'Delta Growth Partners', 'Consultant for enterprise sales in Mumbai. Monthly retainer plus a success fee per client closed.', current_date + 3, founder_name, 'founder', now() - interval '10 days') returning id into r;
  update legal_request set status = 'progress', price = 5000 where id = r;
  insert into legal_payment (request_id, what, amount, gst, gateway, gateway_ref, receipt_no, paid_at) values (r, 'advance', 5000, 900, 'test', 'SAMPLE-' || r || 'a', 'PBA/26-27/L-' || lpad(nextval('legal_receipt_seq')::text, 4, '0'), now() - interval '10 days');
  insert into legal_note (request_id, by_name, by_role, text, at) values
    (r, pba_name, 'pba', 'Is the success fee paid once per client, or for as long as the client stays? It changes the clause.', now() - interval '9 days'),
    (r, founder_name, 'founder', 'Once per client, on the first payment received.', now() - interval '9 days');

  -- 4. Waiting for our price (long file)
  insert into legal_request (company_id, type_id, title, party, need, needed_by, created_by_name, created_by_role, pages, created_at) values (p, 'rvend', 'Cloud hosting reseller agreement', 'Nimbus Cloud Services', 'Three-year hosting commitment. Want to know what happens if we need to leave early.', current_date + 7, founder_name, 'founder', 32, now() - interval '8 days') returning id into r;
  insert into legal_file (request_id, storage_path, filename, pages, by_name) values (r, p || '/legal-in/nimbus-reseller-agreement.pdf', 'nimbus-reseller-agreement.pdf', 32, founder_name);
  return next p || '/legal-in/nimbus-reseller-agreement.pdf';

  -- 5. Extra work to approve
  insert into legal_request (company_id, type_id, title, party, need, needed_by, created_by_name, created_by_role, created_at) values (p, 'esop', 'ESOP grant letters — 4 employees', null, 'Grants approved at the September board meeting for four employees.', current_date - 2, founder_name, 'founder', now() - interval '18 days') returning id into r;
  update legal_request set status = 'progress', price = 4000 where id = r;
  insert into legal_payment (request_id, what, amount, gst, gateway, gateway_ref, receipt_no, paid_at) values (r, 'advance', 4000, 720, 'test', 'SAMPLE-' || r || 'a', 'PBA/26-27/L-' || lpad(nextval('legal_receipt_seq')::text, 4, '0'), now() - interval '18 days');
  insert into legal_extra (request_id, what, amount, reason, by_name, status, at) values (r, 'Three more grant letters', 3000, 'The price covers one employee. Three more letters at ₹1,000 each.', pba_name, 'proposed', now() - interval '9 days');
  update legal_request set status = 'extra', ready_path = p || '/legal-out/' || r || '/esop-grant-letters-x4.pdf', ready_filename = 'esop-grant-letters-x4.pdf', ready_at = now() - interval '9 days' where id = r;
  return next p || '/legal-out/' || r || '/esop-grant-letters-x4.pdf';

  -- 6. Waiting for payment
  insert into legal_request (company_id, type_id, title, party, need, needed_by, created_by_name, created_by_role, created_at) values (p, 'notice', 'Reply to a notice from a former contractor', 'R. Kumar (former contractor)', 'Claims ₹1.8 lakh unpaid fees. We paid in full; bank proof attached.', current_date + 1, founder_name, 'founder', now() - interval '11 days') returning id into r;
  update legal_request set status = 'pay', quote_amount = 9000, quote_note = 'Includes one call with you and a reply on letterhead. If it goes further, that is a separate request.', quoted_by_name = pba_name, quoted_at = now() - interval '10 days' where id = r;
  insert into legal_file (request_id, storage_path, filename, by_name) values (r, p || '/legal-in/notice-r-kumar.pdf', 'notice-r-kumar.pdf', founder_name);
  return next p || '/legal-in/notice-r-kumar.pdf';

  perform set_config('legal.confirm', 'off', true);
end $$;

grant execute on function dev_reset_company(uuid) to authenticated;
grant execute on function dev_seed_legal(uuid, text, text) to authenticated;
