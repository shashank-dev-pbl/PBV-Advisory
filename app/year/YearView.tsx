"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { safeStorageSegment } from "@/lib/storagePath";
import { fyForPeriod } from "@/lib/period";
import { markFiled, verifyFiling } from "./actions";
import { UserMenu, type CurrentUser } from "../founder/FounderView";
import type { Company, Obligation, ObligationOwner } from "@/lib/types";

const OWNER_LABEL: Record<ObligationOwner, string> = { founder: "Founder", practitioner: "Practitioner", pba: "PBA" };
const STATUS_CHIP: Record<Obligation["status"], { label: string; bg: string; color: string }> = {
  pending: { label: "Not filed", bg: "#f1ece0", color: "var(--ink-secondary)" },
  filed: { label: "Awaiting PBA", bg: "#e9eef5", color: "#26527f" },
  verified: { label: "Verified by PBA", bg: "var(--green-soft, #e8efe6)", color: "var(--bottomline-green)" },
};

export default function YearView({
  company,
  currentUser,
  obligations,
  financialYearStart,
}: {
  company: Company;
  currentUser: CurrentUser;
  obligations: Obligation[];
  financialYearStart: string;
}) {
  const [lens, setLens] = useState<"period" | "work">("period");
  const [items, setItems] = useState(obligations);

  function patch(id: string, p: Partial<Obligation>) {
    setItems((prev) => prev.map((o) => (o.id === id ? { ...o, ...p } : o)));
  }

  const groups = useMemo(() => {
    const key = (o: Obligation) => (lens === "period" ? o.fy : fyForPeriod(o.period, financialYearStart));
    const map = new Map<string, Obligation[]>();
    for (const o of items) {
      const k = key(o);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(o);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items, lens, financialYearStart]);

  return (
    <div className="min-h-screen" style={{ background: "var(--paper)" }}>
      <header className="flex items-center justify-between border-b px-5 py-4 md:px-8" style={{ borderColor: "var(--rule)" }}>
        <div>
          <p className="eyebrow" style={{ color: "var(--bottomline-green)" }}>Prime Bottomline Advisory</p>
          <h1 className="text-[18px] font-extrabold">{company?.name} <span style={{ color: "var(--bottomline-green)" }}>· Year</span></h1>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href={currentUser.role === "founder" ? "/founder" : currentUser.role === "practitioner" ? "/practitioner" : "/pba"}
            className="btn-small"
            style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)", gap: 6 }}
          >
            <ArrowLeft size={13} strokeWidth={1.75} />
            Back
          </Link>
          <UserMenu user={currentUser} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8">
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setLens("period")}
            className="btn-small"
            style={{
              background: lens === "period" ? "var(--bottomline-green)" : "transparent",
              color: lens === "period" ? "var(--paper)" : "var(--ink-secondary)",
              border: "1px solid var(--bottomline-green)",
            }}
          >
            Period — belongs to
          </button>
          <button
            onClick={() => setLens("work")}
            className="btn-small"
            style={{
              background: lens === "work" ? "var(--bottomline-green)" : "transparent",
              color: lens === "work" ? "var(--paper)" : "var(--ink-secondary)",
              border: "1px solid var(--bottomline-green)",
            }}
          >
            Work — falls due
          </button>
        </div>
        <p className="mb-6 text-[12.5px]" style={{ color: "var(--ink-secondary)" }}>
          {lens === "period"
            ? "Grouped by the financial year each obligation belongs to."
            : "Grouped by the financial year each obligation is actually due in — a last year's return due this year shows up here, not above."}
        </p>

        {groups.map(([fy, list]) => (
          <div key={fy} className="mb-8">
            <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--ink)" }}>{fy}</p>
            <div className="flex flex-col gap-2">
              {list.map((o) => (
                <ObligationRow key={o.id} obligation={o} currentUser={currentUser} companyId={company.id} onPatch={patch} />
              ))}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}

function ObligationRow({
  obligation,
  currentUser,
  companyId,
  onPatch,
}: {
  obligation: Obligation;
  currentUser: CurrentUser;
  companyId: string;
  onPatch: (id: string, p: Partial<Obligation>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canFile = currentUser.role === obligation.owner && obligation.status === "pending";
  const canVerify = currentUser.role === "pba" && obligation.status === "filed";
  const chip = STATUS_CHIP[obligation.status];

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const supabase = createClient();
      const path = `${companyId}/obligations/${obligation.id}/${Date.now()}-${safeStorageSegment(file.name)}`;
      const { error: uploadError } = await supabase.storage.from("docs").upload(path, file);
      if (uploadError) throw uploadError;
      await markFiled({ obligationId: obligation.id, storagePath: path, filename: file.name, filedOn: new Date().toISOString().slice(0, 10) });
      onPatch(obligation.id, { status: "filed", filed_on: new Date().toISOString().slice(0, 10), evidence_filename: file.name });
    } catch {
      // left as pending; user can retry
    }
    setBusy(false);
  }

  async function handleVerify() {
    setBusy(true);
    await verifyFiling(obligation.id);
    onPatch(obligation.id, { status: "verified" });
    setBusy(false);
  }

  const overdue = obligation.status !== "verified" && new Date(obligation.statutory_due_date) < new Date();

  return (
    <div className="p-4" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[13.5px] font-bold" style={{ color: "var(--ink)" }}>{obligation.name}</p>
          <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--ink-secondary)" }}>
            {obligation.category} · due {new Date(obligation.statutory_due_date).toLocaleDateString()} · {OWNER_LABEL[obligation.owner]}
            {overdue && <span style={{ color: "#8c1a1a", fontWeight: 600 }}> · overdue</span>}
          </p>
          {obligation.evidence_filename && (
            <p className="mt-1 text-[11.5px]" style={{ color: "var(--ink-secondary)" }}>{obligation.evidence_filename}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="pill" style={{ background: chip.bg, color: chip.color, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 20 }}>
            {chip.label}
          </span>
          {canFile && (
            <button onClick={() => fileInputRef.current?.click()} disabled={busy} className="btn-small" style={{ background: "var(--bottomline-green)", color: "var(--paper)", border: "1px solid var(--bottomline-green)" }}>
              {busy ? "Uploading…" : "Attach evidence"}
            </button>
          )}
          {canVerify && (
            <button onClick={handleVerify} disabled={busy} className="btn-small" style={{ background: "var(--bottomline-green)", color: "var(--paper)", border: "1px solid var(--bottomline-green)" }}>
              {busy ? "Verifying…" : "Verify"}
            </button>
          )}
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
