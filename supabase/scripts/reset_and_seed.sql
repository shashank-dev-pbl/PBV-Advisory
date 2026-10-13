-- ONE-TIME RESET. Run in the Supabase SQL editor. It deletes ALL companies, people, access, uploads, figures,
-- data-room records and sign-in accounts, then registers the three people below. Templates and the document
-- lists (checklist templates, document library, event types) are NOT touched.
-- Files already in storage are not deleted by SQL (use Storage -> docs -> delete, if you want them gone).

begin;

truncate table company, app_user, platform_admin, access_log restart identity cascade;
delete from auth.users;

-- Vimal: PBA admin (runs the tool: creates companies, adds people and their mobile numbers)
insert into app_user (name, phone, email, account_type, role, position, can_verify, can_publish, company_id)
values ('Vimal', '919903547435', null, 'admin', 'pba', 'PBA admin', true, true, null);
insert into platform_admin (phone, name) values ('919903547435', 'Vimal');

-- Swetha Ranganathan: PBA practitioner
insert into app_user (name, phone, email, account_type, role, position, can_verify, can_publish, company_id)
values ('Swetha Ranganathan', '919585442481', null, 'pba', 'pba', 'PBA practitioner', true, true, null);

-- Shashank: founder (for testing what a founder sees)
insert into app_user (name, phone, email, account_type, role, position, can_verify, can_publish, company_id)
values ('Shashank', '919148379624', null, 'founder', 'founder', 'Founder', false, false, null);

commit;
