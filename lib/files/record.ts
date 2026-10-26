// One new version of a file (never an overwrite), shared by the company master, the data room and the monthly close.
import type { SupabaseClient } from "@supabase/supabase-js";

export async function recordFileVersion(supabase: SupabaseClient, user: { company_id: string; role: string }, by: string, input: { reqKey: string; storagePath: string; filename: string; reason?: string; period?: string | null }) {
  if (!input.storagePath.startsWith(`${user.company_id}/master/`)) throw new Error("That file is not in this company's folder");
  const period = input.period ?? null;
  if (period && user.role === "founder") {       // books, the MIS workbook and filing proof are not the founder's to upload (spec 06)
    const { data: rule } = await supabase.from("master_rule").select("section").eq("rule_id", input.reqKey.split(":")[0]).maybeSingle();
    if (input.reqKey === "MIS" || input.reqKey.startsWith("F:") || rule?.section === "books") throw new Error("Books, the MIS workbook and filing proof are uploaded by the person who closes the books.");
  }
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
  await supabase.from("master_log").insert({ company_id: user.company_id, who_name: by, kind: isReplace ? "replace" : "upload", note: `${isReplace ? "Replaced" : "Uploaded"} ${input.filename}`, reason: input.reason?.trim() || null });
}
