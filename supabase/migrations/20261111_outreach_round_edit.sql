-- Outreach: fill in or correct a company's round details by hand (round, amount, lead investor, what they do).
-- Needed for leads that came in without them (older leads, imports): their messages have holes and the extension will not send those.
-- Run in the SQL editor of the project it is meant for (dev first). Safe to run twice. Requires 20261110_outreach_v3.sql.

begin;

create or replace function outreach_set_round(p_id bigint, p_round text, p_amount text, p_lead_investor text, p_description text)
returns void language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not outreach_staff() then raise exception 'You don''t have access to this action'; end if;
  update outreach_queue set
    round_name = coalesce(nullif(btrim(p_round), ''), round_name),
    round_amount = coalesce(nullif(btrim(p_amount), ''), round_amount),
    lead_investor = coalesce(nullif(btrim(p_lead_investor), ''), lead_investor),
    description = coalesce(nullif(btrim(p_description), ''), description),
    last_error = null, updated_at = now()
  where id = p_id and stage in ('discovered', 'verifying', 'ready', 'conn_sent', 'connected', 'msg1', 'fu1', 'fu2');
  get diagnostics n = row_count;
  if n = 0 then raise exception 'This company is closed or has replied, so its details are no longer edited here'; end if;
  perform outreach_log(p_id, 'Round details edited by hand');
end $$;

revoke all on function outreach_set_round(bigint, text, text, text, text) from public, anon;
grant execute on function outreach_set_round(bigint, text, text, text, text) to authenticated;

commit;
