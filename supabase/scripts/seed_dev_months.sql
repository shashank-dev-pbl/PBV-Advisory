-- DEV ONLY (project rmremcfziihikwboiooa). Nine published months of sample figures for "Xploro (test)", so the dashboard has something to show
-- without uploading nine workbooks. The figures are made up. Run seed_dev.sql first. Safe to re-run: it removes its own sample rows first.
begin;

do $$
declare
  cid uuid := '00000000-0000-4000-8000-0000000000a1';
  ext uuid := (select id from app_user where phone = '910000000002');
  pba uuid := (select id from app_user where phone = '910000000001');
  m date; i int := 0; up uuid; net numeric; cash numeric := 7050000;
begin
  delete from period_figures where company_id = cid and period between '2026-01' and '2026-09';
  delete from mis_upload where company_id = cid and file_path like 'sample/%';
  delete from month where company_id = cid and period between '2026-01' and '2026-09';
  for m in select generate_series('2026-01-01'::date, '2026-09-01'::date, interval '1 month')::date loop
    i := i + 1;
    net := (700000 + i * 95000);                                   -- ₹7.0L growing
    insert into mis_upload (company_id, period, file_path, filename, file_hash, template_version, checks_all_pass, uploaded_by)
    values (cid, to_char(m, 'YYYY-MM'), 'sample/' || to_char(m, 'YYYY-MM') || '.xlsx', 'MIS ' || to_char(m, 'Mon YYYY') || '.xlsx', md5(m::text), '1.0', true, ext) returning id into up;
    cash := cash - (260000 - i * 8000);
    insert into period_figures (company_id, period, version, state, source_upload_id, cash_opening, cash_closing, cash_restricted, gross_burn, net_burn, expenses_accrual,
      revenue_total, revenue_subscription, revenue_service, revenue_project, partner_share_paid, clients_active, clients_added, clients_lost, top_client_revenue, top5_client_revenue,
      receivables_total, receivables_0_30, receivables_31_60, receivables_61_90, receivables_90_plus, payables_total, billed_month, collections_month,
      submitted_by, submitted_at, verified_by, verified_at, published_by, published_at)
    values (cid, to_char(m, 'YYYY-MM'), 1, 'published', up, cash + (260000 - i * 8000), cash, 1500000, 1000000 + i * 20000, 260000 - i * 8000, 1050000 + i * 40000,
      net, round(net * (0.60 + i * 0.02)), round(net * (0.28 - i * 0.01)), round(net * (0.12 - i * 0.01)), round(net * 0.08), 5 + i / 3, case when i % 2 = 0 then 1 else 0 end, case when i = 6 then 1 else 0 end,
      round(net * (0.47 - i * 0.012)), round(net * 0.9), round(net * 1.1), round(net * 0.7), round(net * 0.25), round(net * 0.1), 150000 + i * 15000, 400000 + i * 12000,
      round(net * 1.18), round(net * (1.18 - (case when i in (3, 4) then 0.25 else 0.1 end))),
      ext, m + interval '1 month 6 days', pba, m + interval '1 month 9 days', pba, m + interval '1 month 9 days');
    insert into month (company_id, period, submitted_by, submitted_by_name, submitted_at, published_by, published_by_name, published_at)
    values (cid, to_char(m, 'YYYY-MM'), ext, 'Test External CA', m + interval '1 month 6 days', pba, 'Test PBA Practitioner', m + interval '1 month 9 days');
  end loop;
end $$;

commit;
select period, state, revenue_total, cash_closing from period_figures where company_id = '00000000-0000-4000-8000-0000000000a1' order by period;
