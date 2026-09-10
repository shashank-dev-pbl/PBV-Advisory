"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { safeStorageSegment } from "@/lib/storagePath";
import { markFiled } from "../year/actions";
import { formatPeriodLabel } from "@/lib/period";
import type { Obligation } from "@/lib/types";

const STATUS_CHIP: Record<Obligation["status"], { label: string; bg: string; color: string }> = {
  pending: { label: "Not filed", bg: "#f1ece0", color: "var(--ink-secondary)" },
  filed: { label: "Awaiting PBA", bg: "#e9eef5", color: "#26527f" },
  verified: { label: "Verified by PBA", bg: "var(--bottomline-green)", color: "#fff" },
};

export default function FilingsTable({ companyId, period, filings }: { companyId: string; period: string; filings: Obligation[] }) {
  const [items, setItems] = useState(filings);

  if (items.length === 0) return null;

  return (
    <section className="mb-10">
      <p className="mb-1 text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--ink)" }}>
        Filings — {formatPeriodLabel(period)}
      </p>
      <p className="mb-3 text-[12px]" style={{ color: "var(--ink-secondary)" }}>
        A filing cannot be closed without its evidence attached. PBA verifies each one.
      </p>
      <table className="w-full" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--rule)" }}>
            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--ink-secondary)" }}>Filing</th>
            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--ink-secondary)" }}>Due</th>
            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--ink-secondary)" }}>Filed on</th>
            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--ink-secondary)" }}>Evidence</th>
            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--ink-secondary)" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((f) => (
            <FilingRow
              key={f.id}
              filing={f}
              companyId={companyId}
              onPatch={(p) => setItems((prev) => prev.map((x) => (x.id === f.id ? { ...x, ...p } : x)))}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function FilingRow({
  filing,
  companyId,
  onPatch,
}: {
  filing: Obligation;
  companyId: string;
  onPatch: (p: Partial<Obligation>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chip = STATUS_CHIP[filing.status];
  const isLate = filing.status === "pending" && new Date(filing.statutory_due_date) < new Date();

  async function handleFile(file: File) {
    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      const path = `${companyId}/obligations/${filing.id}/${Date.now()}-${safeStorageSegment(file.name)}`;
      const { error: uploadError } = await supabase.storage.from("docs").upload(path, file);
      if (uploadError) throw uploadError;
      const filedOn = new Date().toISOString().slice(0, 10);
      await markFiled({ obligationId: filing.id, storagePath: path, filename: file.name, filedOn });
      onPatch({ status: "filed", filed_on: filedOn, evidence_filename: file.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed — try again.");
    }
    setBusy(false);
  }

  return (
    <tr style={{ borderBottom: "1px solid var(--rule2, var(--rule))" }}>
      <td className="px-3 py-2 text-[13.5px]" style={{ color: "var(--ink)" }}>{filing.name}</td>
      <td className="px-3 py-2 text-[13px]" style={{ color: isLate ? "#8c1a1a" : "var(--ink)", fontWeight: isLate ? 600 : 400 }}>
        {new Date(filing.statutory_due_date).toLocaleDateString()}
      </td>
      <td className="px-3 py-2 text-[13px]" style={{ color: "var(--ink)" }}>
        {filing.filed_on ? new Date(filing.filed_on).toLocaleDateString() : "—"}
      </td>
      <td className="px-3 py-2 text-[13px]" style={{ color: "var(--ink)" }}>{filing.evidence_filename ?? "—"}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span style={{ background: chip.bg, color: chip.color, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 20 }}>
            {busy ? "Uploading…" : chip.label}
          </span>
          {filing.status === "pending" && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="text-[11.5px] font-semibold"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--bottomline-green)" }}
            >
              Upload
            </button>
          )}
        </div>
        {error && <p className="mt-1 text-[11px]" style={{ color: "#8c1a1a" }}>{error}</p>}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = "";
          }}
        />
      </td>
    </tr>
  );
}
