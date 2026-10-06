import JSZip from "jszip";
import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// "Download all as one file": the current copy of every standard document, as a ZIP.
export async function GET() {
  const user = await getCurrentAppUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });
  const supabase = await createClient();
  const { data: docs } = await supabase
    .from("standard_document")
    .select("kind, version, storage_path, filename, standard_kind(label, grp)")
    .eq("company_id", user.company_id)
    .order("version", { ascending: false });
  const seen = new Set<string>();
  const zip = new JSZip();
  for (const d of (docs ?? []) as unknown as { kind: string; version: number; storage_path: string; filename: string; standard_kind: { label: string; grp: string } }[]) {
    if (seen.has(d.kind)) continue;
    seen.add(d.kind);
    const { data: blob } = await supabase.storage.from("docs").download(d.storage_path);
    if (!blob) continue;
    zip.file(`${d.standard_kind.grp}/${d.standard_kind.label} (v${d.version}) - ${d.filename}`.replace(/[\\:*?"<>|]/g, "-"), await blob.arrayBuffer());
  }
  const out = await zip.generateAsync({ type: "uint8array" });
  return new NextResponse(out as unknown as BodyInit, {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="data-room.zip"` },
  });
}
