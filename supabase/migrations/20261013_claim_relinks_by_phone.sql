-- A phone number is the identity (one login per number), so a sign-in always (re)links its person record,
-- even if the record still pointed at an older login that no longer exists.
create or replace function claim_app_user() returns void
language plpgsql security definer set search_path = public as $$
declare p text := regexp_replace(coalesce(auth.jwt() ->> 'phone', ''), '\D', '', 'g');
begin
  if auth.uid() is null or p = '' then return; end if;
  update app_user
  set auth_user_id = auth.uid(), last_login_at = now()
  where regexp_replace(coalesce(phone, ''), '\D', '', 'g') = p
    and auth_user_id is distinct from auth.uid();
end;
$$;
