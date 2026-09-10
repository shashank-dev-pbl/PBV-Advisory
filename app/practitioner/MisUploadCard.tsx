"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { safeStorageSegment } from "@/lib/storagePath";
import { submitMisUpload, submitToPBA, uploadSignedPdf } from "./mis-actions";
import type { PeriodFiguresState } from "@/lib/types";

type MisState = {
  id: string;
  state: PeriodFiguresState;
  query_text: string | null;
  pdf_filename: string | null;
  mis_upload: { filename: string; uploaded_at: string; template_version: string } | null;
} | null;

export default function MisUploadCard({
  companyId,
  period,
  initial,
}: {
  companyId: string;
  period: string;
  initial: MisState;
}) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      // Storage RLS requires company_id as the first path segment — same convention as doc_item uploads.
      const path = `${companyId}/mis/${period}/${Date.now()}-${safeStorageSegment(file.name)}`;
      const { error: uploadError } = await supabase.storage.from("docs").upload(path, file);
      if (uploadError) throw uploadError;

      const result = await submitMisUpload({ companyId, period, storagePath: path, filename: file.name });
      if (!result.ok) {
        setError(result.message);
        setBusy(false);
        return;
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed — try again.");
      setBusy(false);
    }
  }

  async function handlePdfFile(file: File) {
    if (!state) return;
    setPdfBusy(true);
    setError("");
    try {
      const supabase = createClient();
      const path = `${companyId}/mis-pdf/${period}/${Date.now()}-${safeStorageSegment(file.name)}`;
      const { error: uploadError } = await supabase.storage.from("docs").upload(path, file);
      if (uploadError) throw uploadError;
      await uploadSignedPdf({ periodFiguresId: state.id, storagePath: path, filename: file.name });
      setState({ ...state, pdf_filename: file.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF upload failed — try again.");
    }
    setPdfBusy(false);
  }

  async function handleSubmitToPBA() {
    if (!state) return;
    setBusy(true);
    setError("");
    try {
      await submitToPBA(state.id);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit — try again.");
      setBusy(false);
    }
  }

  return (
    <section className="mb-10">
      <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--ink)" }}>
        The month&apos;s MIS
      </p>
      {state?.query_text && (
        <div className="mb-2 p-3" style={{ background: "#fdf3dd", border: "1px solid #e3d4a8" }}>
          <p className="text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: "#8a6412" }}>Query from PBA</p>
          <p className="mt-1 text-[13px]" style={{ color: "#4d3c14" }}>{state.query_text}</p>
        </div>
      )}
      <div className="p-4" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)" }}>
        {state?.mis_upload ? (
          <>
            <div
              className="p-4 text-center"
              style={{ border: "1.5px dashed var(--rule)", background: "var(--paper)" }}
            >
              <p className="text-[15px] font-bold" style={{ color: "var(--ink)" }}>{state.mis_upload.filename}</p>
              <p className="mt-1 text-[12.5px]" style={{ color: "var(--ink-secondary)" }}>
                Uploaded {new Date(state.mis_upload.uploaded_at).toLocaleString()} · template version {state.mis_upload.template_version} · 24 figures found
              </p>
            </div>

            <div className="mt-3 flex flex-col gap-1.5 border-t pt-3" style={{ borderColor: "var(--rule)" }}>
              {(() => {
                const checkColor = state.state === "draft" ? "var(--bottomline-green)" : "var(--ink-secondary)";
                return (
                  <>
                    <p className="text-[12.5px]" style={{ color: checkColor }}>✓ Template version recognised</p>
                    <p className="text-[12.5px]" style={{ color: checkColor }}>✓ All 24 figures read cleanly</p>
                    <p className="text-[12.5px]" style={{ color: checkColor }}>✓ The workbook&apos;s own five checks pass</p>
                  </>
                );
              })()}
            </div>

            {state.state === "draft" ? (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleSubmitToPBA}
                  disabled={busy}
                  className="btn-small"
                  style={{ background: "var(--bottomline-green)", color: "var(--paper)", border: "1px solid var(--bottomline-green)" }}
                >
                  {busy ? "Submitting…" : "Submit to PBA"}
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                  className="btn-small"
                  style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)" }}
                >
                  Replace file
                </button>
              </div>
            ) : state.state === "submitted" ? (
              <p className="mt-3 text-[12.5px] font-semibold" style={{ color: "var(--bottomline-green)" }}>
                Submitted to PBA — not yet visible to the founder.
              </p>
            ) : (
              <p className="mt-3 text-[12.5px] font-semibold" style={{ color: "var(--bottomline-green)" }}>
                Published — visible on the founder&apos;s dashboard.
              </p>
            )}
          </>
        ) : (
          <div
            className="cursor-pointer p-6 text-center"
            style={{ border: "1.5px dashed var(--rule)", background: "var(--paper)" }}
            onClick={() => fileInputRef.current?.click()}
          >
            <p className="text-[14px] font-bold" style={{ color: "var(--ink)" }}>
              {busy ? "Reading workbook…" : "Upload this month's MIS workbook"}
            </p>
            <p className="mt-1 text-[12.5px]" style={{ color: "var(--ink-secondary)" }}>
              One .xlsx file, in the agreed template.
            </p>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />

        {error && <p className="mt-3 text-[12.5px]" style={{ color: "#8c1a1a" }}>{error}</p>}
      </div>

      {state?.mis_upload && (
        <div className="mt-2 p-4 flex items-center justify-between gap-3" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)" }}>
          <div>
            <p className="text-[13px] font-bold" style={{ color: "var(--ink)" }}>Signed MIS, PDF</p>
            <p className="mt-0.5 text-[12px]" style={{ color: "var(--ink-secondary)" }}>
              {state.pdf_filename ?? "Optional — the version the founder downloads. The workbook is what the portal reads."}
            </p>
          </div>
          <button
            onClick={() => pdfInputRef.current?.click()}
            disabled={pdfBusy}
            className="btn-small"
            style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)", flexShrink: 0 }}
          >
            {pdfBusy ? "Uploading…" : state.pdf_filename ? "Replace PDF" : "Upload PDF"}
          </button>
          <input
            ref={pdfInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handlePdfFile(file);
              e.target.value = "";
            }}
          />
        </div>
      )}
    </section>
  );
}
