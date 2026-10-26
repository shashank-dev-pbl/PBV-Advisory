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
