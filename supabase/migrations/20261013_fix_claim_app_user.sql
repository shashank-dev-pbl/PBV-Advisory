-- Links a signed-in login to the person an admin registered, matching the mobile number on digits only
-- (the sign-in service and the people table can differ on "+", spaces or dashes). Runs at first sign-in.
drop function if exists claim_app_user();

create function claim_app_user() returns void
language plpgsql security definer set search_path = public as $$
declare p text := regexp_replace(coalesce(auth.jwt() ->> 'phone', ''), '\D', '', 'g');
begin
  if auth.uid() is null or p = '' then return; end if;
  update app_user
  set auth_user_id = auth.uid(), last_login_at = now()
  where auth_user_id is null
    and regexp_replace(coalesce(phone, ''), '\D', '', 'g') = p;
end;
$$;

grant execute on function claim_app_user() to authenticated;
revoke execute on function claim_app_user() from anon, public;
