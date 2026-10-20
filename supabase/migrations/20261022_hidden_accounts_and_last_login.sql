-- 1. A hidden account can sign in but is not shown anywhere in the portal (people, company lists, history).
--    Used for a developer's own test login. Set it with: update app_user set hidden = true where phone = '<digits>';
-- 2. claim_app_user now records the real last sign-in on every sign-in, not only the first.

alter table app_user add column if not exists hidden boolean not null default false;

create or replace function claim_app_user() returns void
language plpgsql security definer set search_path = public as $$
declare p text := regexp_replace(coalesce(auth.jwt() ->> 'phone', ''), '\D', '', 'g');
begin
  if auth.uid() is null or p = '' then return; end if;
  update app_user
  set auth_user_id = auth.uid(), last_login_at = now()
  where regexp_replace(coalesce(phone, ''), '\D', '', 'g') = p;
end;
$$;
grant execute on function claim_app_user() to authenticated;
revoke execute on function claim_app_user() from anon, public;
