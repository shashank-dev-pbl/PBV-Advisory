"use client";

import { useState } from "react";
import { saveRevenueInfo } from "@/app/founder/actions";

export default function RevenueInfoBanner({
  companyId,
  revenueClassification,
  grossNetBilling,
}: {
  companyId: string;
  revenueClassification: string;
  grossNetBilling: string;
}) {
  const [rev, setRev] = useState(revenueClassification);
  const [billing, setBilling] = useState(grossNetBilling);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    await saveRevenueInfo(companyId, rev, billing);
    setSaving(false);
    setSaved(true);
  }

  if (saved) return null;

  return (
    <div className="mb-8 p-5" style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.3)" }}>
      <p className="mb-3 text-[13px] font-bold" style={{ color: "#7a5a00" }}>
        Before anything else — two quick questions
      </p>
      <label className="mb-1 block text-[11px] font-semibold" style={{ color: "var(--ink-secondary)" }}>
        Revenue classification — how much is recurring subscription, hands-on service, or one-off project work?
      </label>
      <textarea className="input-field mb-3" rows={2} value={rev} onChange={(e) => setRev(e.target.value)} />
      <label className="mb-1 block text-[11px] font-semibold" style={{ color: "var(--ink-secondary)" }}>
        Gross vs. net billing — where revenue is shared with a partner, are you invoiced the full amount or only your share?
      </label>
      <textarea className="input-field mb-3" rows={2} value={billing} onChange={(e) => setBilling(e.target.value)} />
      <button onClick={handleSave} disabled={saving || !rev || !billing} className="btn-primary">
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
