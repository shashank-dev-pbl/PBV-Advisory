"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/permissions";
import { guarded } from "@/lib/actionResult";
import type { Answers } from "@/lib/master/types";

// Founder, external practitioner and PBA (an admin acts as PBA) can all answer and upload. Every change is logged with
// who did it, and a change to a step that is already done needs a reason. Files are never deleted.
const MEMBERS = ["founder", "practitioner", "pba"] as const;

async function ctx() {
  const user = await requireRole(...MEMBERS);
  return { user, supabase: await createClient(), by: user.name ?? "Someone" };
}
const refresh = () => { revalidatePath("/company-master"); revalidatePath("/", "layout"); };

async function _saveAnswers(input: { answers: Answers; step: number; what: string; why?: string }) {
  const { user, supabase, by } = await ctx();
  if (typeof input.answers !== "object" || input.answers === null || JSON.stringify(input.answers).length > 200_000) throw new Error("Those answers are not valid");
  const { data: cur } = await supabase.from("company_master").select("steps_done").eq("company_id", user.company_id).maybeSingle();
  const done = (cur?.steps_done ?? []) as number[];

  const { error } = await supabase.from("company_master").upsert(
    { company_id: user.company_id, answers: input.answers, steps_done: done, updated_at: new Date().toISOString(), updated_by_name: by },
    { onConflict: "company_id" },
  );
  if (error) throw new Error(error.message);
  const tracking = input.answers.trackingStart;
  if (tracking && /^\d{4}-\d{2}$/.test(tracking)) await supabase.from("company").update({ tracking_start: tracking }).eq("id", user.company_id);
  await supabase.from("master_log").insert({
    company_id: user.company_id, who_name: by, step: input.step, kind: "answer", note: input.what.slice(0, 300), reason: input.why?.trim() || null,
  });
  refresh();
}

async function _setStepDone(step: number, done: boolean, why?: string) {
  const { user, supabase, by } = await ctx();
  const { data: cur } = await supabase.from("company_master").select("steps_done, answers").eq("company_id", user.company_id).maybeSingle();
  const set = new Set<number>((cur?.steps_done ?? []) as number[]);
  if (done) set.add(step); else set.delete(step);
  const steps = [...set].sort((a, b) => a - b);
  const { error } = await supabase.from("company_master").upsert(
    { company_id: user.company_id, answers: cur?.answers ?? {}, steps_done: steps, completed: steps.includes(12), updated_at: new Date().toISOString(), updated_by_name: by },
    { onConflict: "company_id" },
  );
  if (error) throw new Error(error.message);
  await supabase.from("master_log").insert({
    company_id: user.company_id, who_name: by, step, kind: done ? "complete" : "reopen", note: done ? `Completed step ${step}` : `Reopened step ${step}`, reason: why?.trim() || null,
  });
  refresh();
}

async function _recordFile(input: { reqKey: string; storagePath: string; filename: string; reason?: string; period?: string | null }) {
  const { user, supabase, by } = await ctx();
  if (!input.storagePath.startsWith(`${user.company_id}/master/`)) throw new Error("That file is not in this company's folder");
  const period = input.period ?? null;
  let q = supabase.from("file_version").select("version").eq("company_id", user.company_id).eq("req_key", input.reqKey).order("version", { ascending: false }).limit(1);
  q = period ? q.eq("period", period) : q.is("period", null);
  const { data: last } = await q.maybeSingle();
  const isReplace = !!last;
  if (isReplace && !input.reason?.trim()) throw new Error("Say why you are replacing this file. It is kept with the old version.");
  const { error } = await supabase.from("file_version").insert({
    company_id: user.company_id, req_key: input.reqKey, period, version: (last?.version ?? 0) + 1, storage_path: input.storagePath, filename: input.filename,
    by_name: by, by_role: user.role, reason: input.reason?.trim() || null,
  });
  if (error) throw new Error(error.message);
  await supabase.from("master_log").insert({
    company_id: user.company_id, who_name: by, kind: isReplace ? "replace" : "upload", note: `${isReplace ? "Replaced" : "Uploaded"} ${input.filename}`, reason: input.reason?.trim() || null,
  });
  refresh();
}

// Removing marks the latest version removed. The row and the stored file stay.
async function _removeFile(reqKey: string, reason: string, period?: string | null) {
  const { user, supabase, by } = await ctx();
  if (!reason.trim()) throw new Error("Say why you are removing this file.");
  let q = supabase.from("file_version").update({ removed: true, reason: reason.trim() }).eq("company_id", user.company_id).eq("req_key", reqKey).eq("removed", false);
  q = period ? q.eq("period", period) : q.is("period", null);
  const { data, error } = await q.select("filename");
  if (error) throw new Error(error.message);
  await supabase.from("master_log").insert({
    company_id: user.company_id, who_name: by, kind: "remove", note: `Removed ${data?.[0]?.filename ?? "a file"}`, reason: reason.trim(),
  });
  refresh();
}

async function _saveSummary(input: { reqKey: string; period?: string | null; values: Record<string, string> }) {
  const { user, supabase, by } = await ctx();
  const rows = Object.entries(input.values).filter(([, v]) => String(v).trim()).map(([field, value]) => ({
    company_id: user.company_id, req_key: input.reqKey, period_key: input.period ?? "", field: field.slice(0, 80), value: String(value).slice(0, 200), entered_by_name: by, entered_at: new Date().toISOString(),
  }));
  if (rows.length === 0) return;
  const { error } = await supabase.from("file_summary").upsert(rows, { onConflict: "company_id,req_key,period_key,field" });
  if (error) throw new Error(error.message);
  await supabase.from("master_log").insert({ company_id: user.company_id, who_name: by, kind: "answer", note: `Added the summary for ${input.reqKey}` });
  revalidatePath("/company-master");
}

export async function saveSummary(...a: Parameters<typeof _saveSummary>) { return guarded(() => _saveSummary(...a)); }
export async function saveAnswers(...a: Parameters<typeof _saveAnswers>) { return guarded(() => _saveAnswers(...a)); }
export async function setStepDone(...a: Parameters<typeof _setStepDone>) { return guarded(() => _setStepDone(...a)); }
export async function recordFile(...a: Parameters<typeof _recordFile>) { return guarded(() => _recordFile(...a)); }
export async function removeFile(...a: Parameters<typeof _removeFile>) { return guarded(() => _removeFile(...a)); }
