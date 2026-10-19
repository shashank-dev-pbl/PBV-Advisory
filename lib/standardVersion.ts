import type { createClient } from "@/lib/supabase/server";

// Adds a new current version of a standard document (the older one is kept). Shared by the data room and the
// master uploader. Plain helper, deliberately not a Server Action: it takes a database client.
export async function newStandardVersion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  kind: string,
  storagePath: string,
  filename: string,
  source: string,
  sourceEventId: string | null,
  by: string | null,
) {
  const { data: k } = await supabase.from("standard_kind").select("code").eq("code", kind).maybeSingle();
  if (!k) throw new Error("Unknown document kind");
  const { data: last } = await supabase
    .from("standard_document")
    .select("version")
    .eq("company_id", companyId)
    .eq("kind", kind)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("standard_document").insert({
    company_id: companyId,
    kind,
    version: (last?.version ?? 0) + 1,
    storage_path: storagePath,
    filename,
    source,
    source_event_id: sourceEventId,
    by_name: by,
  });
  if (error) throw new Error(error.message);
}
