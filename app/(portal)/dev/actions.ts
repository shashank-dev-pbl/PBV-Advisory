"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/permissions";
import { guarded } from "@/lib/actionResult";
import { devToolsOn } from "@/lib/dev/tools";
import { buildPlan, filingsForPeriod, requestsForPeriod, type EngineData } from "@/lib/master/engine";
import { tickKey, misKey, ymOf, ymAdd } from "@/lib/close/state";
import { cashFor, sampleAnswers, sampleMonths, sampleRow, SAMPLE_FROM } from "@/lib/dev/sample";

// TEST-COMPANY TOOLS. Only off production, only for a company named "(test)", only for Prime Bottomline staff. The database functions
// (20261028_dev_tools.sql) refuse anything else again, so these are inert on real data.
async function ctx() {
  const user = await requireRole("pba");
  const supabase = await createClient();
  const { data: co } = await supabase.from("company").select("name").eq("id", user.company_id).maybeSingle();
  if (!devToolsOn(co?.name ?? "")) throw new Error("These tools are only for a test company on the dev site.");
  return { user, supabase, by: user.name ?? "Staff" };
}
const refresh = () => revalidatePath("/", "layout");
const chunk = <T,>(a: T[], n = 400) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function _reset() {
  const { user, supabase } = await ctx();
  const { error } = await supabase.rpc("dev_reset_company", { p: user.company_id });
  if (error) throw new Error(error.message);
  refresh();
}

async function _fill() {
  const { user, supabase, by } = await ctx();
  const cid = user.company_id;
  const reset = await supabase.rpc("dev_reset_company", { p: cid });
  if (reset.error) throw new Error(reset.error.message);

  const [rules, filings, eventDocs, library, access] = await Promise.all([
    supabase.from("master_rule").select("*").eq("active", true).order("sort"),
    supabase.from("master_filing").select("*").eq("active", true).order("sort"),
    supabase.from("event_type_doc").select("event_type, doc_code, need, condition_note"),
    supabase.from("doc_library").select("code, name, form"),
    supabase.from("company_access").select("role, user:user_id(id, name, hidden)").eq("company_id", cid).is("revoked_at", null),
  ]);
  const bad = rules.error ?? filings.error ?? eventDocs.error ?? library.error;
  if (bad) throw new Error(bad.message);
  const people = ((access.data ?? []) as unknown as { role: string; user: { id: string; name: string | null; hidden: boolean } | null }[]).filter((p) => p.user && !p.user.hidden);
  const ext = people.find((p) => p.role === "external")?.user ?? null;
  const pbas = people.filter((p) => p.role === "pba").map((p) => p.user!);
  const publisher = pbas.find((p) => p.id !== ext?.id) ?? null;
  const founder = people.find((p) => p.role === "founder")?.user ?? null;

  const answers = sampleAnswers();
  const data = { rules: rules.data ?? [], filings: filings.data ?? [], eventDocs: eventDocs.data ?? [], library: library.data ?? [] } as EngineData;
  const today = new Date();
  const plan = buildPlan(answers, data, today);

  // A placeholder file stands in for every document.
  const placeholder = `${cid}/master/dev-fill/placeholder.pdf`;
  await supabase.storage.from("docs").upload(placeholder, new Blob(["%PDF-1.4 sample placeholder"], { type: "application/pdf" }), { upsert: true });

  // The documents on the master: everything uploaded except a few left for "later", so the timeline and data room show missing items.
  const later: Record<string, boolean> = {};
  const oneTime: string[] = plan.standard.map((s) => s.key);
  for (const e of plan.events) {
    const keys = e.docs.filter((d) => !d.sharedWith).map((d) => `${e.key}:${d.code ?? d.name}`);
    const keep = e.kind === "incorp" ? keys.slice(0, keys.length - 2) : e.kind === "loan" ? keys.slice(0, 3) : keys.slice(0, 4);
    keep.forEach((k) => oneTime.push(k));
    keys.filter((k) => !keep.includes(k)).forEach((k) => (later[k.replace(/\./g, "_")] = true));
  }
  answers.later = later;
  const { error: me } = await supabase.from("company_master").upsert({ company_id: cid, answers, steps_done: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], completed: true, updated_by_name: by }, { onConflict: "company_id" });
  if (me) throw new Error(me.message);
  await supabase.from("company").update({ tracking_start: SAMPLE_FROM }).eq("id", cid);

  const fv = (key: string, period: string | null, daysAgo: number) => ({ company_id: cid, req_key: key, period, version: 1, storage_path: placeholder, filename: "sample.pdf", by_name: by, by_role: "pba", at: new Date(Date.now() - daysAgo * 864e5).toISOString() });
  const rows = oneTime.map((k) => fv(k, null, 200));
  const months = sampleMonths();
  const published = months.slice(0, 17);                         // Apr 2025 – Aug 2026
  for (const ym of published) {
    const age = Math.max(5, Math.round((today.getTime() - new Date(`${ymAdd(ym, 1)}-05T00:00:00`).getTime()) / 864e5));
    requestsForPeriod(plan, ym).forEach((r) => rows.push(fv(r.key, ym, age)));
    filingsForPeriod(plan, ym).forEach((f) => f.ticks.forEach((t) => rows.push(fv(tickKey(f.key, t), ym, age))));
    rows.push(fv(misKey, ym, age));
  }
  // September 2026: mostly in, payroll and contractor payments from the founder missing, GSTR-3B not filed and no workbook yet — a month that is late.
  const sep = "2026-09";
  requestsForPeriod(plan, sep).filter((r) => !/Payroll register|Contractor payments/.test(r.name)).forEach((r) => rows.push(fv(r.key, sep, 20)));
  filingsForPeriod(plan, sep).forEach((f) => f.ticks.forEach((t) => { if (!(f.name.startsWith("GSTR-3B") && t === "filed")) rows.push(fv(tickKey(f.key, t), sep, 12)); }));
  for (const c of chunk(rows)) { const { error } = await supabase.from("file_version").insert(c); if (error) throw new Error(error.message); }

  // Published figures, with the workbook record behind each, and who submitted and published.
  let upIds: { period: string; id: string }[] = [];
  for (const c of chunk(published.map((ym) => ({ company_id: cid, period: ym, file_path: `sample/${ym}.xlsx`, filename: `MIS ${ym}.xlsx`, file_hash: `sample-${ym}`, template_version: "1.1", checks_all_pass: true, uploaded_by: ext?.id ?? null })), 50)) {
    const { data: ins, error } = await supabase.from("mis_upload").insert(c).select("id, period");
    if (error) throw new Error(error.message);
    upIds = upIds.concat((ins ?? []).map((x) => ({ period: x.period as string, id: x.id as string })));
  }
  const figs = published.map((ym, i) => {
    const at = new Date(`${ymAdd(ym, 1)}-09T10:00:00Z`).toISOString();
    return { company_id: cid, version: 1, state: "published", source_upload_id: upIds.find((u) => u.period === ym)!.id, ...sampleRow(i, ym, cashFor(i)), submitted_by: ext?.id ?? null, submitted_at: new Date(`${ymAdd(ym, 1)}-06T10:00:00Z`).toISOString(), verified_by: publisher?.id ?? user.id, verified_at: at, published_by: publisher?.id ?? user.id, published_at: at };
  });
  for (const c of chunk(figs, 50)) { const { error } = await supabase.from("period_figures").insert(c); if (error) throw new Error(error.message); }
  const monthRows = published.map((ym) => ({ company_id: cid, period: ym, submitted_by: ext?.id ?? null, submitted_by_name: ext?.name ?? "External practitioner", submitted_at: new Date(`${ymAdd(ym, 1)}-06T10:00:00Z`).toISOString(), published_by: publisher?.id ?? user.id, published_by_name: publisher?.name ?? by, published_at: new Date(`${ymAdd(ym, 1)}-09T10:00:00Z`).toISOString() }));
  for (const c of chunk(monthRows, 50)) { const { error } = await supabase.from("month").insert(c); if (error) throw new Error(error.message); }
  const verifies = published.flatMap((ym) => filingsForPeriod(plan, ym).map((f) => ({ company_id: cid, period: ym, filing_key: f.key, verified_by_name: publisher?.name ?? by })));
  for (const c of chunk(verifies)) { const { error } = await supabase.from("filing_verify").insert(c); if (error) throw new Error(error.message); }

  // A few typed summaries, and a history the activity tab can show.
  const bank = plan.recurring.find((r) => r.rule_id === "R16");
  if (bank) {
    const s = published.slice(-3).flatMap((ym, k) => { const r = sampleRow(14 + k, ym, cashFor(14 + k)); return [["Opening balance", r.cash_opening * 0.78], ["Closing balance", r.cash_closing * 0.78], ["Money in", r.collections_month], ["Money out", r.gross_burn]].map(([f, v]) => ({ company_id: cid, req_key: bank.key, period_key: ym, field: f as string, value: String(Math.round(v as number)), entered_by_name: founder?.name ?? by })); });
    await supabase.from("file_summary").insert(s);
  }
  const log = [...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => ({ company_id: cid, who_name: by, step: n, kind: "complete", note: `Completed step ${n}` })), { company_id: cid, who_name: by, kind: "answer", note: "Filled the test company with sample data" }];
  await supabase.from("master_log").insert(log);

  // Legal in every state, with a placeholder file behind each document.
  const legal = await supabase.rpc("dev_seed_legal", { p: cid, founder_name: founder?.name ?? "Founder", pba_name: publisher?.name ?? by });
  if (legal.error) throw new Error(legal.error.message);
  for (const path of (legal.data ?? []) as string[]) await supabase.storage.from("docs").upload(path, new Blob(["%PDF-1.4 sample placeholder"], { type: "application/pdf" }), { upsert: true });
  void ymOf;
  refresh();
}

export async function resetTestCompany() { return guarded(_reset); }
export async function fillTestCompany() { return guarded(_fill); }
