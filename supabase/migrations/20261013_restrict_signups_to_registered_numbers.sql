-- Only numbers an admin has registered may ever be sent a sign-in code.
-- Supabase calls this "Before User Created" hook when someone asks for a code for a number it has never seen,
-- BEFORE it creates the user and BEFORE it sends the SMS. Returning an error stops both, so a stranger who
-- calls the sign-in API directly (bypassing the login page) costs nothing.
--
-- After running this, switch it on in the dashboard:
--   Authentication -> Hooks -> Before User Created -> Postgres function -> public.hook_before_user_created

create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p text := regexp_replace(coalesce(event -> 'user' ->> 'phone', ''), '\D', '', 'g');
begin
  if p <> '' and (
       exists (select 1 from platform_admin where phone = p)
    or exists (select 1 from app_user where phone = p)
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'message', 'This number is not registered. Contact Prime Bottomline Advisory to get access.',
    'http_code', 403));
end;
$$;

grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from authenticated, anon, public;
