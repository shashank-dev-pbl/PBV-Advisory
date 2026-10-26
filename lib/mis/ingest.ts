// Reading the MIS workbook into the month's figures, and moving those figures through submit and publish. Used by the Monthly close
// actions; the roles and the "submitter never publishes" rule are decided by the caller (lib/close/state.ts) and again by the
// database constraints on period_figures.
import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseMisWorkbook } from "@/lib/misReader";
import { PERIOD_FIGURES_FIELDS } from "@/lib/types";
import { formatPeriodLabel, periodHasEnded } from "@/lib/period";
import { getPublishedHistory } from "@/lib/periodFiguresView";
import { runwayMonths } from "@/lib/dashboardCalc";
import { sendEmail } from "@/lib/resend";

type Who = { id: string; company_id: string };
export type IngestResult = { ok: true } | { ok: false; message: string };

// Downloads the just-uploaded workbook, parses it, and only writes figures if every check in the workbook passes.
export async function ingestMis(supabase: SupabaseClient, user: Who, p: { period: string; storagePath: string; filename: string }): Promise<IngestResult> {
  if (!periodHasEnded(p.period)) return { ok: false, message: `${formatPeriodLabel(p.period)} has not ended yet — it can be uploaded from the 1st of next month.` };
  const { data: blob, error: dl } = await supabase.storage.from("docs").download(p.storagePath);
  if (dl || !blob) return { ok: false, message: "Could not read the uploaded file — try again." };
  const buffer = Buffer.from(await blob.arrayBuffer());
  const result = await parseMisWorkbook(buffer);
  if (!result.ok) {
    switch (result.reason) {
      case "unknown_template_version": return { ok: false, message: `Unrecognised template version "${result.templateVersion}" — this doesn't match the agreed format. Use the frozen template.` };
      case "checks_failed": return { ok: false, message: `The workbook's own checks haven't all passed — "${result.failedCheckName}" reads FAIL. Fix it in the workbook and re-upload.` };
      case "bad_value": return { ok: false, message: `"${result.field}" came back as an error, not a number — check the workbook's structure hasn't changed.` };
      case "parse_error": return { ok: false, message: result.message };
    }
  }

  const rows = await supabase.from("period_figures").select("id, version, state, query_text").eq("company_id", user.company_id).eq("period", p.period).order("version", { ascending: false });
  if (rows.error) return { ok: false, message: rows.error.message };
  const latest = rows.data?.[0];
  const active = rows.data?.find((r) => r.state === "draft" || r.state === "submitted");
  if (active?.state === "submitted") return { ok: false, message: "This month has already been submitted for checking — it can't be replaced until PBA sends it back." };
  if (latest?.state === "published" && !latest.query_text) return { ok: false, message: `${formatPeriodLabel(p.period)} is already published. Reopen it first to upload a corrected workbook.` };

  const { data: upload, error: ue } = await supabase.from("mis_upload").insert({
    company_id: user.company_id, period: p.period, file_path: p.storagePath, filename: p.filename, file_hash: createHash("sha256").update(buffer).digest("hex"),
    template_version: result.templateVersion, checks_all_pass: true, uploaded_by: user.id,
  }).select("id").single();
  if (ue || !upload) return { ok: false, message: "Could not record the upload — try again." };

  const figures = Object.fromEntries(PERIOD_FIGURES_FIELDS.map((f) => [f, result.figures[f]]));
  if (active) {
    const { error } = await supabase.from("period_figures").update({ source_upload_id: upload.id, query_text: null, ...figures }).eq("id", active.id).eq("state", "draft");
    if (error) return { ok: false, message: "Could not save the extracted figures — try again." };
  } else {
    const { error } = await supabase.from("period_figures").insert({ company_id: user.company_id, period: p.period, version: (latest?.version ?? 0) + 1, state: "draft", source_upload_id: upload.id, ...figures });
    if (error) return { ok: false, message: "Could not save the extracted figures — try again." };
  }
  return { ok: true };
}

export async function submitFigures(supabase: SupabaseClient, user: Who, period: string) {
  const { data, error } = await supabase.from("period_figures").update({ state: "submitted", submitted_by: user.id, submitted_at: new Date().toISOString() })
    .eq("company_id", user.company_id).eq("period", period).eq("state", "draft").select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("There are no figures to submit for this month — upload the MIS workbook first.");
}

// The submitter can never be the publisher: refused here and by the published_not_submitter constraint.
export async function publishFigures(supabase: SupabaseClient, user: Who, period: string) {
  const { data: row } = await supabase.from("period_figures").select("id, submitted_by").eq("company_id", user.company_id).eq("period", period).eq("state", "submitted").maybeSingle();
  if (!row) throw new Error("There are no submitted figures for this month.");
  if (row.submitted_by === user.id) throw new Error("The account that submitted this month can't also publish it.");
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("period_figures").update({ state: "published", verified_by: user.id, verified_at: now, published_by: user.id, published_at: now, query_text: null }).eq("id", row.id).eq("state", "submitted").select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("This month was not published — it may have changed. Reload and try again.");
  // A corrected month retires the earlier version: kept, but no longer shown to the founder.
  await supabase.from("period_figures").update({ state: "superseded", query_text: null }).eq("company_id", user.company_id).eq("period", period).eq("state", "published").neq("id", row.id);

  // Runway below 4 months emails the founder and PBA straight away.
  const history = await getPublishedHistory(user.company_id, period, 3);
  const { months } = runwayMonths(history);
  if (months !== null && months < 4) {
    const { data: grants } = await supabase.from("company_access").select("role, user:user_id(email)").eq("company_id", user.company_id).is("revoked_at", null).in("role", ["founder", "pba"]);
    const to = ((grants ?? []) as unknown as { user: { email: string } | null }[]).map((g) => g.user?.email).filter((e): e is string => !!e);
    if (to.length > 0) await sendEmail({ to, subject: `Runway alert — ${months.toFixed(1)} months (${formatPeriodLabel(period)})`, html: `<p>Runway is ${months.toFixed(1)} months as of the ${formatPeriodLabel(period)} close, below the 4-month threshold.</p>` });
  }
}

// Reopening asks for a corrected workbook: the published figures stay on the dashboard, marked as being corrected, until the new ones are published.
export async function reopenFigures(supabase: SupabaseClient, user: Who, period: string, reason: string) {
  const { data, error } = await supabase.from("period_figures").update({ query_text: reason }).eq("company_id", user.company_id).eq("period", period).eq("state", "published").select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Only a published month can be reopened.");
}
