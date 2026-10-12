-- Phone-only sign-in: a number is allowed to receive a code only if it belongs to a platform admin or to a
-- person who has been added to at least one company. A registered number with no company is told so.
-- Founders are added by mobile number alone, so email is no longer required on a person.

alter table app_user alter column email drop not null;

create or replace function phone_login_status(p_phone text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select case
    when exists (select 1 from platform_admin where phone = p_phone) then 'ok'
    when exists (
      select 1 from app_user u
      join company_access a on a.user_id = u.id and a.revoked_at is null
      where u.phone = p_phone
    ) then 'ok'
    when exists (select 1 from app_user where phone = p_phone) then 'no_company'
    else 'unknown'
  end;
$$;

grant execute on function phone_login_status(text) to anon, authenticated;
