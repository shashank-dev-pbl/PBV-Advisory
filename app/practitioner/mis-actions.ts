"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/permissions";
import { parseMisWorkbook } from "@/lib/misReader";
import { PERIOD_FIGURES_FIELDS } from "@/lib/types";

export type SubmitMisUploadResult =
  | { ok: true }
  | { ok: false; message: string };

// Downloads the just-uploaded workbook back from Storage, parses it server-side,
// and only writes mis_upload + period_figures if it passes every check. Nothing
// is persisted on a rejected file — a wrong number published confidently is
// worse than a month that is late.
export async function submitMisUpload(params: {
  companyId: string;
  period: string;
  storagePath: string;
  filename: string;
}): Promise<SubmitMisUploadResult> {
  const appUser = await requireRole("practitioner");
  if (appUser.company_id !== params.companyId) {
    return { ok: false, message: "Not authorized for this company" };
  }

  const supabase = await createClient();
  const { data: fileBlob, error: downloadError } = await supabase.storage.from("docs").download(params.storagePath);
  if (downloadError || !fileBlob) {
    return { ok: false, message: "Could not read the uploaded file — try again." };
  }
  const buffer = Buffer.from(await fileBlob.arrayBuffer());
  const fileHash = createHash("sha256").update(buffer).digest("hex");

  const result = await parseMisWorkbook(buffer);

  if (!result.ok) {
    switch (result.reason) {
      case "unknown_template_version":
        return { ok: false, message: `Unrecognised template version "${result.templateVersion}" — this doesn't match the agreed format. Use the frozen template.` };
      case "checks_failed":
        return { ok: false, message: `The workbook's own checks haven't all passed — "${result.failedCheckName}" reads FAIL. Fix it in the workbook and re-upload.` };
      case "bad_value":
        return { ok: false, message: `"${result.field}" came back as an error, not a number — check the workbook's structure hasn't changed.` };
      case "parse_error":
        return { ok: false, message: result.message };
    }
  }

  // Existing draft/submitted row for this period, if any, gets replaced by this upload.
  const { data: existingActive } = await supabase
    .from("period_figures")
    .select("id, version, state")
    .eq("company_id", params.companyId)
    .eq("period", params.period)
    .in("state", ["draft", "submitted"])
    .maybeSingle();

  if (existingActive && existingActive.state === "submitted") {
    return { ok: false, message: "This month has already been submitted to PBA — it can't be replaced from here." };
  }

  const { data: highestVersion } = await supabase
    .from("period_figures")
    .select("version")
    .eq("company_id", params.companyId)
    .eq("period", params.period)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = existingActive?.version ?? (highestVersion?.version ?? 0) + 1;

  const { data: upload, error: uploadError } = await supabase
    .from("mis_upload")
    .insert({
      company_id: params.companyId,
      period: params.period,
      file_path: params.storagePath,
      filename: params.filename,
      file_hash: fileHash,
      template_version: result.templateVersion,
      checks_all_pass: true,
      uploaded_by: appUser.id,
    })
    .select("id")
    .single();
  if (uploadError || !upload) {
    return { ok: false, message: "Could not record the upload — try again." };
  }

  if (existingActive) {
    const { error: replaceError } = await supabase
      .from("period_figures")
      .update({
        source_upload_id: upload.id,
        query_text: null,
        ...Object.fromEntries(PERIOD_FIGURES_FIELDS.map((f) => [f, result.figures[f]])),
      })
      .eq("id", existingActive.id)
      .eq("state", "draft");
    if (replaceError) {
      return { ok: false, message: "Could not save the extracted figures — try again." };
    }
  } else {
    const { error: insertError } = await supabase.from("period_figures").insert({
      company_id: params.companyId,
      period: params.period,
      version: nextVersion,
      state: "draft",
      source_upload_id: upload.id,
      ...Object.fromEntries(PERIOD_FIGURES_FIELDS.map((f) => [f, result.figures[f]])),
    });
    if (insertError) {
      return { ok: false, message: "Could not save the extracted figures — try again." };
    }
  }

  revalidatePath("/practitioner");
  return { ok: true };
}

export async function submitToPBA(periodFiguresId: string) {
  const appUser = await requireRole("practitioner");
  const supabase = await createClient();

  const { error } = await supabase
    .from("period_figures")
    .update({ state: "submitted", submitted_by: appUser.id, submitted_at: new Date().toISOString() })
    .eq("id", periodFiguresId)
    .eq("state", "draft")
    .eq("company_id", appUser.company_id);
  if (error) throw error;

  revalidatePath("/practitioner");
}

export async function getMisState(companyId: string, period: string) {
  const supabase = await createClient();
  const { data: periodFigures } = await supabase
    .from("period_figures")
    .select("*, mis_upload:source_upload_id(filename, uploaded_at, template_version)")
    .eq("company_id", companyId)
    .eq("period", period)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return periodFigures;
}
