-- Outreach: the funding-dashboard import button now also sends each company's latest round (type, amount, date, source article).
-- This replaces outreach_queue_import so those details are stored, and fills them in for a company that was imported earlier without them.
-- Run in the SQL editor of the project it is meant for (dev first). Safe to run twice. Requires 20261110_outreach_v3.sql.

begin;

create or replace function outreach_queue_import(p_key text, p_companies jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare c jsonb; nm text; k text; added int := 0; total int := 0; qid bigint; fresh boolean; d date;
begin
  perform outreach_auth(p_key);
  for c in select * from jsonb_array_elements(coalesce(p_companies, '[]'::jsonb)) loop
    total := total + 1;
    nm := btrim(coalesce(c ->> 'name', ''));
    k := outreach_company_key(nm);
    if nm = '' or k = '' then continue; end if;
    begin d := nullif(c ->> 'announced_on', '')::date; exception when others then d := null; end;

    insert into outreach_queue (company_name, company_key, website, hq, sector, total_raised_text, round_name, round_amount, announced_on, stage, verified_at)
    values (nm, k, nullif(c ->> 'website', ''), nullif(c ->> 'hq', ''), nullif(c ->> 'sector', ''), nullif(c ->> 'total_raised', ''),
            nullif(c ->> 'round', ''), nullif(c ->> 'amount', ''), d, 'ready', now())
    on conflict (company_key) do update set
      round_name = coalesce(outreach_queue.round_name, excluded.round_name),
      round_amount = coalesce(outreach_queue.round_amount, excluded.round_amount),
      announced_on = coalesce(outreach_queue.announced_on, excluded.announced_on),
      website = coalesce(outreach_queue.website, excluded.website),
      hq = coalesce(outreach_queue.hq, excluded.hq),
      sector = coalesce(outreach_queue.sector, excluded.sector)
    returning id, (xmax = 0) into qid, fresh;

    if fresh then
      added := added + 1;
      insert into outreach_source_hit (queue_id, source, url) values (qid, 'import', nullif(c ->> 'url', '')) on conflict (queue_id, source) do nothing;
      perform outreach_log(qid, 'Imported from the funding dashboard' || case when c ->> 'round' is not null then ' (latest round: ' || (c ->> 'round') || ' ' || coalesce(c ->> 'amount', '') || ')' else '' end || '. Needs a founder and approval.');
    elsif nullif(c ->> 'url', '') is not null then
      insert into outreach_source_hit (queue_id, source, url) values (qid, 'import', c ->> 'url')
      on conflict (queue_id, source) do update set url = coalesce(outreach_source_hit.url, excluded.url);
    end if;
  end loop;
  return jsonb_build_object('received', total, 'added', added, 'alreadyQueued', total - added, 'alreadyContacted', 0);
end $$;

revoke all on function outreach_queue_import(text, jsonb) from public, anon, authenticated;
grant execute on function outreach_queue_import(text, jsonb) to anon, authenticated;

commit;
