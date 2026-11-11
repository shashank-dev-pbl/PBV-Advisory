-- Outreach: add a lead by hand from the Outreach page. Touches only outreach_queue. Safe to run more than once.
-- Run it in the project it is meant for (dev for testing, prod for production), after 20261029_outreach.sql.
--
-- With a founder name and LinkedIn profile link the lead starts at "Founder found" (the extension sends the connection request next).
-- Without them it starts at "Scanning" (the extension looks the founder up itself).

create or replace function outreach_add_lead(
  p_company text, p_website text, p_hq text, p_sector text, p_raised text, p_company_url text,
  p_founder_name text, p_founder_title text, p_founder_url text
) returns bigint language plpgsql security definer set search_path = public as $$
declare nm text := btrim(coalesce(p_company, '')); k text; fn text := btrim(coalesce(p_founder_name, '')); fu text := btrim(coalesce(p_founder_url, '')); has_f boolean; new_id bigint;
begin
  if not outreach_staff() then raise exception 'You don''t have access to this action'; end if;
  k := regexp_replace(regexp_replace(lower(nm), '\y(pvt|private|ltd|limited|inc|llp|technologies|technology)\y\.?', '', 'g'), '[^a-z0-9]+', '', 'g');
  if nm = '' or k = '' then raise exception 'Add the company name'; end if;
  has_f := fn <> '' and fu <> '';
  if (fn <> '') <> (fu <> '') then raise exception 'Give both the founder''s name and LinkedIn link, or neither'; end if;
  insert into outreach_queue (company_name, company_key, website, hq, sector, total_raised_text, linkedin_company_url,
                              founder_name, founder_title, founder_url, stage)
  values (nm, k, nullif(btrim(coalesce(p_website, '')), ''), nullif(btrim(coalesce(p_hq, '')), ''), nullif(btrim(coalesce(p_sector, '')), ''),
          nullif(btrim(coalesce(p_raised, '')), ''), nullif(btrim(coalesce(p_company_url, '')), ''),
          case when has_f then fn end, case when has_f then nullif(btrim(coalesce(p_founder_title, '')), '') end, case when has_f then fu end,
          case when has_f then 'founder_found' else 'new' end)
  on conflict (company_key) do nothing
  returning id into new_id;
  if new_id is null then raise exception 'This company is already in the list'; end if;
  return new_id;
end $$;

revoke all on function outreach_add_lead(text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function outreach_add_lead(text, text, text, text, text, text, text, text, text) to authenticated;
