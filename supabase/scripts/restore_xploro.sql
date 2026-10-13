-- Brings Xploro back after the reset: same company id and details, a fresh checklist (one-time, monthly for the
-- month just ended, quarterly/yearly) and its deliverables, live, with Swetha as PBA practitioner and Shashank
-- as founder. Anything that was uploaded or published for Xploro before the reset is gone and is NOT restored.
-- Run in the Supabase SQL editor, after reset_and_seed.sql.

begin;

insert into company (id, name, plan, financial_year_start, revenue_classification, gross_net_billing, books_by, status, first_collect_period)
values ('646035b7-140d-4a22-9540-67d72f7afa55', 'Xploro', 'starter', '2026-04-01',
        'Most of the revenue is recurring subscription ', 'I will invoice the full amount ', 'auditor', 'live', null)
on conflict (id) do nothing;

-- Checklist: the month just ended (India time) is the one being collected.
with m as (
  select to_char(date_trunc('month', now() at time zone 'Asia/Kolkata') - interval '1 month', 'YYYY-MM') as close_month,
         (date_trunc('month', now() at time zone 'Asia/Kolkata'))::date as next_month_start
)
insert into doc_item (company_id, code, group_name, title, prompt, description, priority, allows_multiple, needs_label,
                      nil_return_allowed, register_ref, cadence, due_rule, supplied_by_external, period, due_date, status)
select '646035b7-140d-4a22-9540-67d72f7afa55', t.code, t.group_name, t.title, t.prompt, t.description, t.priority,
       t.allows_multiple, t.needs_label, t.nil_return_allowed, t.register_ref, t.cadence, t.due_rule, t.supplied_by_external,
       case when t.cadence = 'monthly' then m.close_month else 'ONCE' end,
       case when t.cadence = 'monthly' and t.due_rule ~ '^Day \d+$'
            then m.next_month_start + (substring(t.due_rule from '^Day (\d+)$')::int - 1) end,
       'pending'
from doc_item_template t, m
on conflict (company_id, code, period) do nothing;

with m as (select to_char(date_trunc('month', now() at time zone 'Asia/Kolkata') - interval '1 month', 'YYYY-MM') as close_month)
insert into deliverable (company_id, code, title, period, input_codes, status)
select '646035b7-140d-4a22-9540-67d72f7afa55', d.code, d.title,
       case when d.period_type = 'once' then 'ONCE' else m.close_month end, d.input_codes, 'blocked'
from deliverable_template d, m
where d.period_type in ('once', 'monthly')
on conflict (company_id, code, period) do nothing;

-- People on Xploro
insert into company_access (user_id, company_id, role, granted_by_name)
select id, '646035b7-140d-4a22-9540-67d72f7afa55', 'pba', 'Restore' from app_user where phone = '919585442481';
insert into company_access (user_id, company_id, role, granted_by_name)
select id, '646035b7-140d-4a22-9540-67d72f7afa55', 'founder', 'Restore' from app_user where phone = '919148379624';

commit;

select (select count(*) from doc_item where company_id = '646035b7-140d-4a22-9540-67d72f7afa55') as checklist_items,
       (select count(*) from deliverable where company_id = '646035b7-140d-4a22-9540-67d72f7afa55') as deliverables,
       (select count(*) from company_access where company_id = '646035b7-140d-4a22-9540-67d72f7afa55') as people;
