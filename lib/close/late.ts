// How many tracked months are late, for the badge on "Monthly close". Same rules as the page (lib/close/state.ts).
import { createClient } from "@/lib/supabase/server";
import { buildPlan, type EngineData } from "@/lib/master/engine";
import { currentFyStart } from "@/lib/master/engine";
import { monthView, ymAdd, ymOf } from "@/lib/close/state";
import type { Answers } from "@/lib/master/types";

export async function lateMonthCount(companyId: string): Promise<number> {
  const supabase = await createClient();
  const [master, rules, filings, eventDocs, library, files, months, company] = await Promise.all([
    supabase.from("company_master").select("answers").eq("company_id", companyId).maybeSingle(),
    supabase.from("master_rule").select("*").eq("active", true).order("sort"),
    supabase.from("master_filing").select("*").eq("active", true).order("sort"),
    supabase.from("event_type_doc").select("event_type, doc_code, need, condition_note"),
    supabase.from("doc_library").select("code, name, form"),
    supabase.from("file_version").select("req_key, period").eq("company_id", companyId).eq("removed", false).not("period", "is", null),
    supabase.from("month").select("period, submitted_at, published_at").eq("company_id", companyId),
    supabase.from("company").select("tracking_start").eq("id", companyId).maybeSingle(),
  ]);
  if (master.error || rules.error || filings.error || files.error || months.error || !master.data) return 0;
  const answers = (master.data.answers ?? {}) as Answers;
  if (!answers.incorporatedOn) return 0;
  const today = new Date();
  const plan = buildPlan(answers, { rules: rules.data ?? [], filings: filings.data ?? [], eventDocs: eventDocs.data ?? [], library: library.data ?? [] } as EngineData, today);
  const have = new Set((files.data ?? []).map((f) => `${f.req_key}|${f.period}`));
  const inc = answers.incorporatedOn.slice(0, 7), fy = currentFyStart(today);
  const trackFrom = company.data?.tracking_start ?? answers.trackingStart ?? (inc > fy ? inc : fy);
  let late = 0;
  for (let ym = trackFrom; ym < ymOf(today); ym = ymAdd(ym, 1)) {
    const m = (months.data ?? []).find((x) => x.period === ym);
    const v = monthView({ ym, today, trackFrom, plan, has: (k, p) => have.has(`${k}|${p}`), submitted: !!m?.submitted_at && !m.published_at, published: !!m?.published_at });
    if (v.state === "late") late++;
  }
  return late;
}
