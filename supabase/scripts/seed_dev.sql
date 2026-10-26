-- DEV ONLY (project rmremcfziihikwboiooa). Never run on production.
-- One clean test company with test people. Only the first number can sign in with a real code (it is yours);
-- the others are placeholders used through the admin's "act as" view. Test email domain is primebottomline.vc.
begin;

insert into company (id, name, plan, status) values ('00000000-0000-4000-8000-0000000000a1', 'Xploro (test)', 'operator', 'live') on conflict (id) do nothing;

-- You: PBA admin, hidden everywhere on the site, can sign in.
insert into app_user (name, phone, email, account_type, role, position, can_verify, can_publish, hidden)
values ('Shashank', '919148379624', 'shashank@primebottomline.vc', 'admin', 'pba', 'PBA admin', true, true, true) on conflict (phone) do nothing;
insert into platform_admin (phone, name) values ('919148379624', 'Shashank') on conflict do nothing;

-- Placeholder people (cannot receive a code): PBA practitioner, external practitioner, founder.
insert into app_user (name, phone, email, account_type, role, position, can_verify, can_publish, firm_name) values
 ('Test PBA Practitioner', '910000000001', 'pba.test@primebottomline.vc', 'pba', 'pba', 'PBA practitioner', true, true, null),
 ('Test External CA', '910000000002', 'ca.test@primebottomline.vc', 'external', 'practitioner', 'External practitioner', false, false, 'SPARC & Co'),
 ('Test Founder', '910000000003', 'founder.test@primebottomline.vc', 'founder', 'founder', 'Founder', false, false, null)
on conflict (phone) do nothing;

insert into company_access (user_id, company_id, role, granted_by_name)
select u.id, '00000000-0000-4000-8000-0000000000a1',
       case u.phone when '910000000002' then 'external' when '910000000003' then 'founder' else 'pba' end, 'Seed'
from app_user u where u.phone in ('919148379624','910000000001','910000000002','910000000003')
  and not exists (select 1 from company_access a where a.user_id = u.id and a.company_id = '00000000-0000-4000-8000-0000000000a1');

commit;
select (select count(*) from company) companies, (select count(*) from app_user) people, (select count(*) from company_access) access_rows;
