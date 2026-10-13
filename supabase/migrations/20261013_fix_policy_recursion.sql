-- app_user's "same company read users" policy reads company_access, and company_access's "read own or admin
-- access" policy read app_user: the database detected a loop ("infinite recursion detected in policy for
-- relation app_user") and failed every read of app_user for signed-in users. The company_access policy now
-- finds the signed-in person through a security-definer helper, which does not go through app_user's policies.
create or replace function my_app_user_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from app_user where auth_user_id = auth.uid() limit 1
$$;
grant execute on function my_app_user_id() to authenticated;
revoke execute on function my_app_user_id() from anon, public;

drop policy if exists "read own or admin access" on company_access;
create policy "read own or admin access" on company_access
  for select to authenticated
  using (is_platform_admin() or user_id = my_app_user_id());
