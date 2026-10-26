"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/permissions";
import { guarded } from "@/lib/actionResult";
import { buildPlan, booksOwner, type EngineData } from "@/lib/master/engine";
import { canPublish, canSubmit, monthView, ymOf, type Role } from "@/lib/close/state";
import type { Answers } from "@/lib/master/types";
import { ingestMis, publishFigures, reopenFigures, submitFigures } from "@/lib/mis/ingest";
import { recordFileVersion } from "@/lib/files/record";

// Every rule here is checked on the server with the same function the screen uses, never trusted from the browser.
const MEMBERS = ["founder", "practitioner", "pba"] as const;
const roleOf = (r: string): Role => (r === "practitioner" ? "external" : (r as Role));

async function ctx() {
  const user = await requireRole(...MEMBERS);
  return { user, supabase: await createClient(), by: user.name ?? "Someone", role: roleOf(user.role) };
}
const refresh = () => { revalidatePath("/monthly"); revalidatePath("/dashboard"); revalidatePath("/", "layout"); };
const okPeriod = (p: string) => { if (!/^\d{4}-\d{2}$/.test(p)) throw new Error("That is not a month"); };

async function loadMonth(supabase: Awaited<ReturnType<typeof createClient>>, companyId: string, period: string) {
  const [master, rules, filings, eventDocs, library, files, month, company] = await Promise.all([
    supabase.from("company_master").select("answers").eq("company_id", companyId).maybeSingle(),
    supabase.from("master_rule").select("*").eq("active", true).order("sort"),
    supabase.from("master_filing").select("*").eq("active", true).order("sort"),
    supabase.from("event_type_doc").select("event_type, doc_code, need, condition_note").order("sort"),
    supabase.from("doc_library").select("code, name, form").order("sort"),
    supabase.from("file_version").select("req_key").eq("company_id", companyId).eq("period", period).eq("removed", false),
    supabase.from("month").select("*").eq("company_id", companyId).eq("period", period).maybeSingle(),
    supabase.from("company").select("tracking_start").eq("id", companyId).maybeSingle(),
  ]);
  const err = master.error ?? rules.error ?? filings.error ?? files.error ?? month.error;
  if (err) throw new Error(err.message);
  const answers = (master.data?.answers ?? {}) as Answers;
  const data = { rules: rules.data ?? [], filings: filings.data ?? [], eventDocs: eventDocs.data ?? [], library: library.data ?? [] } as EngineData;
  const plan = buildPlan(answers, data);
  const have = new Set((files.data ?? []).map((f) => f.req_key as string));
  const trackFrom = company.data?.tracking_start ?? answers.trackingStart ?? period;
  const view = monthView({ ym: period, today: new Date(), trackFrom, plan, has: (k) => have.has(k), submitted: !!month.data?.submitted_at && !month.data?.published_at, published: !!month.data?.published_at });
  return { answers, view, month: month.data };
}

async function _submitMonth(period: string) {
  okPeriod(period);
  const { user, supabase, by, role } = await ctx();
  const { answers, view } = await loadMonth(supabase, user.company_id, period);
  const refusal = canSubmit(role, booksOwner(answers) === "founder" ? "own" : booksOwner(answers) === "pba" ? "pba" : "firm", view, period, new Date());
  if (refusal) throw new Error(refusal);
  await submitFigures(supabase, user, period);
  const { error } = await supabase.from("month").upsert({ company_id: user.company_id, period, submitted_by: user.id, submitted_by_name: by, submitted_at: new Date().toISOString(), published_by: null, published_by_name: null, published_at: null }, { onConflict: "company_id,period" });
  if (error) throw new Error(error.message);
  await supabase.from("master_log").insert({ company_id: user.company_id, who_name: by, kind: "answer", note: `Submitted ${period} for checking` });
  refresh();
}

async function _publishMonth(period: string, reason?: string) {
  okPeriod(period);
  const { user, supabase, by, role } = await ctx();
  const { view, month } = await loadMonth(supabase, user.company_id, period);
  if (!month?.submitted_at || month.published_at) throw new Error("This month is not waiting to be published");
  const refusal = canPublish(role, month.submitted_by, user.id);
  if (refusal) throw new Error(refusal);
  if (!view.ready) throw new Error("Something has been removed since this month was submitted. It needs everything in again.");
  await publishFigures(supabase, user, period);
  const { error } = await supabase.from("month").update({ published_by: user.id, published_by_name: by, published_at: new Date().toISOString() }).eq("company_id", user.company_id).eq("period", period);
  if (error) throw new Error(error.message);
  await supabase.from("master_log").insert({ company_id: user.company_id, who_name: by, kind: "answer", note: `Published ${period}`, reason: reason?.trim() || null });
  refresh();
}

async function _reopenMonth(period: string, reason: string) {
  okPeriod(period);
  const { user, supabase, by, role } = await ctx();
  if (role !== "pba") throw new Error("Only Prime Bottomline can reopen a month.");
  if (!reason.trim()) throw new Error("Say why you are reopening this month.");
  const { data: m } = await supabase.from("month").select("reopened, submitted_at").eq("company_id", user.company_id).eq("period", period).maybeSingle();
  if (!m?.submitted_at) throw new Error("This month has not been submitted");
  await reopenFigures(supabase, user, period, reason.trim());
  const reopened = [...((m.reopened as unknown[]) ?? []), { by, at: new Date().toISOString(), reason: reason.trim() }];
  const { error } = await supabase.from("month").update({ submitted_at: null, submitted_by: null, submitted_by_name: null, published_at: null, published_by: null, published_by_name: null, reopened }).eq("company_id", user.company_id).eq("period", period);
  if (error) throw new Error(error.message);
  await supabase.from("master_log").insert({ company_id: user.company_id, who_name: by, kind: "reopen", note: `Reopened ${period}`, reason: reason.trim() });
  refresh();
}

async function _verifyFiling(period: string, filingKey: string) {
  okPeriod(period);
  const { user, supabase, by, role } = await ctx();
  if (role !== "pba") throw new Error("Only Prime Bottomline verifies filings.");
  const { error } = await supabase.from("filing_verify").upsert({ company_id: user.company_id, period, filing_key: filingKey.slice(0, 120), verified_by_name: by, verified_at: new Date().toISOString() }, { onConflict: "company_id,period,filing_key" });
  if (error) throw new Error(error.message);
  revalidatePath("/monthly");
}

async function _setTrackingStart(start: string, reason: string) {
  okPeriod(start);
  const { user, supabase, by } = await ctx();
  if (!reason.trim()) throw new Error("Say why you are changing the tracking start.");
  if (start > ymOf(new Date())) throw new Error("Tracking cannot start in the future.");
  const { data: cur } = await supabase.from("company").select("tracking_start").eq("id", user.company_id).maybeSingle();
  const { data: master } = await supabase.from("company_master").select("answers, steps_done").eq("company_id", user.company_id).maybeSingle();
  const { error } = await supabase.from("company").update({ tracking_start: start }).eq("id", user.company_id);
  if (error) throw new Error(error.message);
  if (master) await supabase.from("company_master").update({ answers: { ...(master.answers as Answers), trackingStart: start } }).eq("company_id", user.company_id);
  await supabase.from("master_log").insert({ company_id: user.company_id, who_name: by, kind: "answer", note: `Changed monthly tracking start from ${cur?.tracking_start ?? "the default"} to ${start}`, reason: reason.trim() });
  refresh();
}

export async function submitMonth(...a: Parameters<typeof _submitMonth>) { return guarded(() => _submitMonth(...a)); }
export async function publishMonth(...a: Parameters<typeof _publishMonth>) { return guarded(() => _publishMonth(...a)); }
export async function reopenMonth(...a: Parameters<typeof _reopenMonth>) { return guarded(() => _reopenMonth(...a)); }
export async function verifyFiling(...a: Parameters<typeof _verifyFiling>) { return guarded(() => _verifyFiling(...a)); }
export async function setTrackingStart(...a: Parameters<typeof _setTrackingStart>) { return guarded(() => _setTrackingStart(...a)); }

// The MIS workbook: read and checked first, and only recorded as the month's file if it passes — a wrong number is worse than a late month.
async function _submitMis(input: { period: string; storagePath: string; filename: string; reason?: string }) {
  okPeriod(input.period);
  const { user, supabase, by, role } = await ctx();
  if (role === "founder") throw new Error("The MIS workbook is uploaded by the person who closes the books.");
  const done = await ingestMis(supabase, user, { period: input.period, storagePath: input.storagePath, filename: input.filename });
  if (!done.ok) throw new Error(done.message);
  await recordFileVersion(supabase, user, by, { reqKey: "MIS", storagePath: input.storagePath, filename: input.filename, reason: input.reason, period: input.period });
  refresh();
}
export async function submitMis(...a: Parameters<typeof _submitMis>) { return guarded(() => _submitMis(...a)); }

// DEV ONLY: puts a placeholder file against every document and filing proof a month is still missing (not the MIS workbook, which is read
// for real), so the two-person submit and publish rules can be tried without uploading twenty files by hand. Refused on production and on
// any company that is not a test company.
export const devToolsOn = (companyName: string) => process.env.VERCEL_ENV !== "production" && /\(test\)/i.test(companyName);
async function _fillWithTestFiles(period: string) {
  okPeriod(period);
  const { user, supabase, by, role } = await ctx();
  const { data: co } = await supabase.from("company").select("name").eq("id", user.company_id).maybeSingle();
  if (!devToolsOn(co?.name ?? "")) throw new Error("This tool is only for test companies on the dev site.");
  if (role !== "pba") throw new Error("Only Prime Bottomline staff can use it.");
  const { answers, view } = await loadMonth(supabase, user.company_id, period);
  void answers;
  const path = `${user.company_id}/master/dev-fill/placeholder.pdf`;
  await supabase.storage.from("docs").upload(path, new Blob(["%PDF-1.4 test placeholder"], { type: "application/pdf" }), { upsert: true });
  const { data: have } = await supabase.from("file_version").select("req_key").eq("company_id", user.company_id).eq("period", period).eq("removed", false);
  const got = new Set((have ?? []).map((f) => f.req_key as string));
  const keys = [...view.docs, ...view.books].map((r) => r.key).concat(view.filings.flatMap((f) => f.ticks.map((t) => `F:${f.key}:${t}`)));
  const rows = keys.filter((k) => !got.has(k)).map((k) => ({ company_id: user.company_id, req_key: k, period, version: 1, storage_path: path, filename: "test-file.pdf", by_name: by, by_role: user.role, reason: null }));
  if (rows.length) { const { error } = await supabase.from("file_version").insert(rows); if (error) throw new Error(error.message); }
  refresh();
  return rows.length;
}
export async function fillWithTestFiles(...a: Parameters<typeof _fillWithTestFiles>) { return guarded(() => _fillWithTestFiles(...a)); }
