"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { safeStorageSegment } from "@/lib/storagePath";
import { uploadSignedPdf } from "@/app/practitioner/mis-actions";

export default function UploadPdf({ companyId, periodFiguresId, period, replace }: { companyId: string; periodFiguresId: string; period: string; replace: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handle(file: File) {
    setBusy(true);
    setError("");
    try {
      const path = `${companyId}/mis-pdf/${period}/${Date.now()}-${safeStorageSegment(file.name)}`;
      const { error: uploadError } = await createClient().storage.from("docs").upload(path, file);
      if (uploadError) throw new Error(uploadError.message);
      await uploadSignedPdf({ periodFiguresId, storagePath: path, filename: file.name });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed — try again.");
      setBusy(false);
    }
  }

  return (
    <div>
      <button onClick={() => input.current?.click()} disabled={busy} className="btn-small" style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)" }}>
        {busy ? "Uploading…" : replace ? "Replace PDF" : "Upload signed PDF"}
      </button>
      {error && <p className="mt-1 text-[11.5px]" style={{ color: "#8c1a1a" }}>{error}</p>}
      <input ref={input} type="file" accept=".pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handle(f); e.target.value = ""; }} />
    </div>
  );
}
