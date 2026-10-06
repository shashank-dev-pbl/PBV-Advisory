"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { grantAccess, removeAccess, goLive, type AccessRow, type CompanyRow } from "../actions";

const ROLE_LABEL = { founder: "Founder", external: "External practitioner", pba: "PBA practitioner" } as const;
const TYPE_ROLE: Record<string, string> = { founder: "Founder", external: "External practitioner", pba: "PBA practitioner" };

export default function CompanyDetail({
  company, people, addable,
}: {
  company: CompanyRow;
  people: AccessRow[];
  addable: { id: string; label: string; accountType: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pick, setPick] = useState("");

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
    setBusy(false);
  }

  const hasFounder = people.some((p) => p.role === "founder");
  const hasPba = people.some((p) => p.role === "pba");

  return (
    <div className="mx-auto w-full max-w-[1000px] px-5 py-8 md:px-8">
      <Link href="/admin/companies" className="text-[12.5px] font-semibold" style={{ color: "var(--bottomline-green)" }}>← All companies</Link>

      <div className="mb-6 mt-3 flex flex-wrap items-center justify-between gap-3 p-4" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 10 }}>
        <div>
          <p className="text-[17px] font-extrabold">{company.name}</p>
          <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--ink-secondary)" }}>
            {company.plan[0].toUpperCase() + company.plan.slice(1)} plan · year starts {company.fyStart} · books kept by {company.booksBy === "pba" ? "Prime Bottomline" : "their own auditor"}
          </p>
        </div>
        {company.status === "live" ? (
          <span className="pill" style={{ background: "var(--bottomline-green)", color: "#fff" }}>Live</span>
        ) : (
          <button onClick={() => run(() => goLive(company.id))} disabled={busy || !hasFounder || !hasPba} className="btn-small" style={{ background: hasFounder && hasPba ? "var(--bottomline-green)" : "var(--rule)", color: "var(--paper)", border: "1px solid " + (hasFounder && hasPba ? "var(--bottomline-green)" : "var(--rule)"), cursor: hasFounder && hasPba ? "pointer" : "not-allowed" }}>
            Go live
          </button>
        )}
      </div>
      {company.status !== "live" && (
        <div className="mb-6 p-3 text-[12.5px]" style={{ background: "#fdf3dd", border: "1px solid #e3d4a8", color: "#6b5320" }}>
          A company cannot go live without a founder and a PBA practitioner on it.
          {!hasFounder && " Needs a founder."}{!hasPba && " Needs a PBA practitioner."}
        </div>
      )}

      <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.1em]">People on {company.name}</h2>
      <table className="mb-6 w-full" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--rule)" }}>
            {["Name", "Mobile", "Role here", ""].map((h) => (
              <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--ink-secondary)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {people.length === 0 && <tr><td colSpan={4} className="px-3 py-3 text-[13px]" style={{ color: "var(--ink-secondary)" }}>Nobody yet.</td></tr>}
          {people.map((p) => (
            <tr key={p.id} style={{ borderBottom: "1px solid var(--rule)" }}>
              <td className="px-3 py-2.5 text-[13.5px] font-semibold">{p.name}{p.firm ? <span style={{ color: "var(--ink-secondary)", fontWeight: 400 }}> · {p.firm}</span> : null}</td>
              <td className="px-3 py-2.5 text-[13px]">{p.mobile ? `+${p.mobile.slice(0, 2)} ${p.mobile.slice(2, 5)}•• •••${p.mobile.slice(-2)}` : "—"}</td>
              <td className="px-3 py-2.5 text-[13px]">{ROLE_LABEL[p.role]}</td>
              <td className="px-3 py-2.5 text-right">
                <button onClick={() => run(() => removeAccess(p.id))} disabled={busy} className="btn-small" style={{ background: "transparent", border: "1px solid #8c1a1a", color: "#8c1a1a" }}>Remove access</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="p-4" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 10 }}>
        <p className="mb-3 text-[14px] font-bold">Give someone access to {company.name}</p>
        <label className="text-[12px] font-semibold">Person
          <select className="input-field mt-1" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Choose someone already added…</option>
            {addable.map((a) => <option key={a.id} value={a.id}>{a.label} — {TYPE_ROLE[a.accountType]}</option>)}
          </select>
          <span className="mt-1 block text-[11px] font-normal" style={{ color: "var(--ink-secondary)" }}>Not listed? Add them under People &amp; access first. Their role here follows their account type.</span>
        </label>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={() => run(async () => { await grantAccess(pick, company.id); setPick(""); })} disabled={busy || !pick} className="btn-small" style={{ background: "var(--bottomline-green)", color: "var(--paper)", border: "1px solid var(--bottomline-green)" }}>
            Give access
          </button>
          <span className="text-[12px]" style={{ color: "var(--ink-secondary)" }}>Takes effect immediately and is recorded.</span>
        </div>
        {error && <p className="mt-3 text-[12.5px]" style={{ color: "#8c1a1a" }}>{error}</p>}
      </div>
    </div>
  );
}
