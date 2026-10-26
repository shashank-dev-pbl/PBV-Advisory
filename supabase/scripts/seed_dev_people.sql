-- DEV ONLY (project rmremcfziihikwboiooa). Two more people on "Xploro (test)" so a month can be submitted by one PBA person and
-- published by another. Their sign-in codes are the test codes set in the dev project's Phone auth settings, so no SMS is sent.
begin;
insert into app_user (name, phone, email, account_type, role, position, can_verify, can_publish, hidden) values
  ('Vimal', '919903547435', 'vimal.test@primebottomline.vc', 'admin', 'pba', 'PBA admin', true, true, false),
  ('Swetha Ranganathan', '919585442481', 'swetha.test@primebottomline.vc', 'pba', 'pba', 'PBA practitioner', true, true, false)
on conflict (phone) do nothing;
insert into platform_admin (phone, name) values ('919903547435', 'Vimal') on conflict do nothing;
insert into company_access (user_id, company_id, role, granted_by_name)
select u.id, '00000000-0000-4000-8000-0000000000a1', 'pba', 'Seed' from app_user u
where u.phone in ('919903547435', '919585442481')
  and not exists (select 1 from company_access a where a.user_id = u.id and a.company_id = '00000000-0000-4000-8000-0000000000a1');
commit;
select name, phone, role from app_user where phone in ('919903547435', '919585442481');
