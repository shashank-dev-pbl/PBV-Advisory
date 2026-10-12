"use client";

import { adminError } from "@/lib/adminError";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { grantAccess, addFounder, removeAccess, goLive, generateMonth, type AccessRow, type CompanyRow } from "../actions";
import { formatPeriodLabel } from "@/lib/period";

const ROLE_LABEL = { founder: "Founder", external: "External practitioner", pba: "PBA practitioner" } as const;
type RoleKey = "founder" | "external" | "pba";
const ROLE_OF: Record<string, RoleKey> = { founder: "founder", external: "external", pba: "pba" };

export default function CompanyDetail({
  company, people, addable, monthlyReady, closeMonth,
}: {
  company: CompanyRow;
  people: AccessRow[];
  monthlyReady: boolean;
  closeMonth: string;
  addable: { id: string; label: string; accountType: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pick, setPick] = useState("");
  const [mode, setMode] = useState<"person" | "founder">("person");
  const [role, setRole] = useState<RoleKey>("external");
  const [mobile, setMobile] = useState("");
  const [fname, setFname] = useState("");

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(adminError(e, "Something went wrong"));
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
      {company.status !== "live" && (hasFounder && hasPba ? (
        <div className="mb-6 flex items-start gap-2 p-3 text-[12.5px]" style={{ background: "#fdf3dd", border: "1px solid #e3d4a8", color: "#6b5320" }}>
          <span aria-hidden style={{ fontWeight: 800 }}>⚠</span>
          <span>Ready to go live. Going live opens {company.name} to the people on it and creates its checklist.</span>
        </div>
      ) : (
        <div className="mb-6 p-3 text-[12.5px]" style={{ background: "#fbe9e7", border: "1px solid #e3b8b2", color: "#8c1a1a" }}>
          <p className="mb-1 font-semibold">A company cannot go live until both of these are on it:</p>
          {[["A founder", hasFounder], ["A PBA practitioner", hasPba]].map(([label, ok]) => (
            <p key={label as string} className="flex items-center gap-2" style={{ color: ok ? "#004d00" : "#8c1a1a" }}>
              <span aria-hidden style={{ fontWeight: 800 }}>{ok ? "✓" : "✗"}</span>{label as string}{ok ? "" : " — required"}
            </p>
          ))}
        </div>
      ))}

      {!monthlyReady && company.status === "live" && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 p-3.5" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 10 }}>
          <p className="text-[13px]">The {formatPeriodLabel(closeMonth)} monthly items have not been created yet.</p>
          <button onClick={() => run(() => generateMonth(company.id))} disabled={busy} className="btn-small" style={{ background: "var(--bottomline-green)", color: "var(--paper)", border: "1px solid var(--bottomline-green)" }}>
            Create {formatPeriodLabel(closeMonth).split(" ")[0]}&apos;s monthly items
          </button>
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
        <div className="mb-3 flex gap-2">
          {([["person", "Someone already added"], ["founder", "Add a founder by mobile"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => { setMode(k); setError(""); }} className="btn-small"
              style={{ background: mode === k ? "var(--bottomline-green)" : "transparent", color: mode === k ? "var(--paper)" : "var(--ink-secondary)", border: "1px solid var(--bottomline-green)" }}>{l}</button>
          ))}
        </div>
        {mode === "person" ? (
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-[12px] font-semibold">Person
              <select className="input-field mt-1" value={pick} onChange={(e) => { setPick(e.target.value); const a = addable.find((x) => x.id === e.target.value); if (a && a.accountType !== "admin") setRole(ROLE_OF[a.accountType] ?? "external"); }}>
                <option value="">Choose someone…</option>
                {addable.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
              <span className="mt-1 block text-[11px] font-normal" style={{ color: "var(--ink-secondary)" }}>Practitioners and PBA staff are added under People &amp; access first. Founders are added by mobile number instead.</span>
            </label>
            <label className="text-[12px] font-semibold">Role on {company.name}
              <select className="input-field mt-1" value={role} onChange={(e) => setRole(e.target.value as RoleKey)}>
                <option value="external">External practitioner</option>
                <option value="pba">PBA practitioner</option>
              </select>
            </label>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-[12px] font-semibold">Founder&apos;s mobile number
              <div className="mt-1 flex items-stretch gap-2">
                <span className="input-field flex items-center justify-center" style={{ flex: "0 0 auto", width: 56 }}>+91</span>
                <input type="tel" inputMode="numeric" maxLength={10} className="input-field" placeholder="98765 43210" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} />
              </div>
            </label>
            <label className="text-[12px] font-semibold">Name (optional)
              <input className="input-field mt-1" value={fname} onChange={(e) => setFname(e.target.value)} />
            </label>
            <span className="text-[11px] md:col-span-2" style={{ color: "var(--ink-secondary)" }}>Only the mobile number is needed. When they sign in with it they get a code and land on {company.name}&apos;s dashboard.</span>
          </div>
        )}
        <div className="mt-3 flex items-center gap-3">
          {mode === "person" ? (
            <button onClick={() => run(async () => { await grantAccess(pick, company.id, role); setPick(""); })} disabled={busy || !pick} className="btn-small" style={{ background: "var(--bottomline-green)", color: "var(--paper)", border: "1px solid var(--bottomline-green)" }}>Give access</button>
          ) : (
            <button onClick={() => run(async () => { await addFounder(company.id, mobile, fname); setMobile(""); setFname(""); })} disabled={busy || !mobile} className="btn-small" style={{ background: "var(--bottomline-green)", color: "var(--paper)", border: "1px solid var(--bottomline-green)" }}>Add founder</button>
          )}
          <span className="text-[12px]" style={{ color: "var(--ink-secondary)" }}>Takes effect immediately and is recorded.</span>
        </div>
        {error && <p className="mt-3 text-[12.5px]" style={{ color: "#8c1a1a" }}>{error}</p>}
      </div>
    </div>
  );
}
