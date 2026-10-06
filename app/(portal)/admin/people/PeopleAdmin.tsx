"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addPerson, editPerson, type LogRow, type PersonRow } from "../actions";
import { WHO_LABEL } from "@/lib/access";
import type { AccountType } from "@/lib/types";

const TYPE_LABEL: Record<AccountType, string> = WHO_LABEL;
const ACTION_TEXT: Record<string, string> = {
  company_created: "created",
  company_live: "took live",
  month_generated: "created the monthly items for",
  person_added: "added",
  person_edited: "edited",
  access_granted: "gave access to",
  access_removed: "removed access from",
};

function maskMobile(m: string | null) {
  if (!m) return "—";
  return `+${m.slice(0, 2)} ${m.slice(2, 5)}•• •••${m.slice(-2)}`;
}

function describe(l: LogRow) {
  const verb = ACTION_TEXT[l.action] ?? l.action;
  if (l.action === "company_created" || l.action === "company_live" || l.action === "month_generated") return `${l.who} ${verb} ${l.company}${l.action === "month_generated" && l.detail ? ` (${l.detail})` : ""}`;
  if (l.action === "person_added" || l.action === "person_edited") return `${l.who} ${verb} ${l.target}${l.detail ? ` (${TYPE_LABEL[l.detail as AccountType] ?? l.detail})` : ""}`;
  return `${l.who} ${verb} ${l.target ?? "someone"}${l.company ? ` on ${l.company}` : ""}${l.detail ? ` as ${l.detail}` : ""}`;
}

export default function PeopleAdmin({
  people, companies, log, adminTypeAllowed,
}: {
  people: PersonRow[];
  companies: { id: string; name: string }[];
  log: LogRow[];
  adminTypeAllowed: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [f, setF] = useState({ name: "", mobile: "", email: "", accountType: "founder" as AccountType, firmName: "", companyId: "" });
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", email: "", firm: "" });

  async function add() {
    setBusy(true);
    setError("");
    try {
      await addPerson({ ...f, companyId: f.companyId || null });
      setOpen(false);
      setF({ name: "", mobile: "", email: "", accountType: "founder", firmName: "", companyId: "" });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the person");
    }
    setBusy(false);
  }

  async function save(p: PersonRow) {
    setBusy(true);
    setError("");
    try {
      await editPerson(p.id, { name: draft.name, email: draft.email, firmName: p.accountType === "external" ? draft.firm : undefined });
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto w-full max-w-[1000px] px-5 py-8 md:px-8">
      <div className="mb-4">
        <button onClick={() => setOpen((v) => !v)} className="btn-small" style={{ background: "var(--bottomline-green)", color: "var(--paper)", border: "1px solid var(--bottomline-green)" }}>+ Add person</button>
      </div>

      {open && (
        <div className="mb-6 p-4" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 10 }}>
          <p className="mb-3 text-[14px] font-bold">Add a person</p>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-[12px] font-semibold">Name
              <input className="input-field mt-1" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </label>
            <label className="text-[12px] font-semibold">Mobile number
              <div className="mt-1 flex gap-2">
                <span className="input-field flex items-center justify-center" style={{ flex: "0 0 56px" }}>+91</span>
                <input className="input-field" placeholder="10 digits" inputMode="numeric" maxLength={10} value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value.replace(/\D/g, "") })} />
              </div>
              <span className="mt-1 block text-[11px] font-normal" style={{ color: "var(--ink-secondary)" }}>They sign in with a code texted here. Two people can&apos;t share a number.</span>
            </label>
            <label className="text-[12px] font-semibold">Email
              <input className="input-field mt-1" placeholder="For notices and alerts" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            </label>
            <label className="text-[12px] font-semibold">Account type
              <select className="input-field mt-1" value={f.accountType} onChange={(e) => setF({ ...f, accountType: e.target.value as AccountType })}>
                <option value="founder">Founder</option>
                <option value="external">External practitioner</option>
                <option value="pba">PBA practitioner</option>
                {adminTypeAllowed && <option value="admin">PBA admin</option>}
              </select>
            </label>
            {f.accountType === "external" && (
              <label className="text-[12px] font-semibold">Firm name
                <input className="input-field mt-1" placeholder="e.g. SPARC & Co" value={f.firmName} onChange={(e) => setF({ ...f, firmName: e.target.value })} />
                <span className="mt-1 block text-[11px] font-normal" style={{ color: "var(--ink-secondary)" }}>Shown on everything they upload.</span>
              </label>
            )}
            {f.accountType !== "admin" && (
              <label className="text-[12px] font-semibold">Give access to
                <select className="input-field mt-1" value={f.companyId} onChange={(e) => setF({ ...f, companyId: e.target.value })}>
                  <option value="">Not yet</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
          </div>
          <div className="mt-4 flex gap-3">
            <button onClick={add} disabled={busy} className="btn-small" style={{ background: "var(--bottomline-green)", color: "var(--paper)", border: "1px solid var(--bottomline-green)" }}>{busy ? "Adding…" : "Add person"}</button>
            <button onClick={() => setOpen(false)} className="btn-small" style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)" }}>Cancel</button>
          </div>
        </div>
      )}
      {error && <p className="mb-3 text-[12.5px]" style={{ color: "#8c1a1a" }}>{error}</p>}

      <table className="w-full" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--rule)" }}>
            {["Name", "Mobile", "Email", "Account type", "Companies", "Last sign-in", ""].map((h) => (
              <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--ink-secondary)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.id} style={{ borderBottom: "1px solid var(--rule)" }}>
              {editing === p.id ? (
                <>
                  <td className="px-3 py-2"><input className="input-field" style={{ minHeight: 34, padding: "6px 8px", fontSize: 13 }} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></td>
                  <td className="px-3 py-2 text-[13px]">{maskMobile(p.mobile)}</td>
                  <td className="px-3 py-2"><input className="input-field" style={{ minHeight: 34, padding: "6px 8px", fontSize: 13 }} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></td>
                  <td className="px-3 py-2 text-[13px]">
                    {TYPE_LABEL[p.accountType]}
                    {p.accountType === "external" && <input className="input-field mt-1" placeholder="Firm name" style={{ minHeight: 34, padding: "6px 8px", fontSize: 13 }} value={draft.firm} onChange={(e) => setDraft({ ...draft, firm: e.target.value })} />}
                  </td>
                  <td className="px-3 py-2 text-[13px]" colSpan={2}></td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => save(p)} disabled={busy} className="btn-small" style={{ background: "var(--bottomline-green)", color: "var(--paper)", border: "1px solid var(--bottomline-green)" }}>Save</button>
                  </td>
                </>
              ) : (
                <>
                  <td className="px-3 py-2.5 text-[13.5px] font-bold">{p.name ?? "—"}</td>
                  <td className="px-3 py-2.5 text-[13px]" style={{ whiteSpace: "nowrap" }}>{maskMobile(p.mobile)}</td>
                  <td className="px-3 py-2.5 text-[13px]">{p.email}</td>
                  <td className="px-3 py-2.5 text-[13px]">{TYPE_LABEL[p.accountType]}{p.firm ? ` (${p.firm})` : ""}</td>
                  <td className="px-3 py-2.5 text-[13px]">{p.companies.join(", ") || <span style={{ color: "var(--ink-secondary)" }}>None yet</span>}</td>
                  <td className="px-3 py-2.5 text-[13px]" style={{ color: "var(--ink-secondary)" }}>{p.lastSignIn ? new Date(p.lastSignIn).toLocaleDateString() : "Never"}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button onClick={() => { setEditing(p.id); setDraft({ name: p.name ?? "", email: p.email, firm: p.firm ?? "" }); }} className="btn-small" style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)" }}>Edit</button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mb-2 mt-8 text-[13px] font-bold uppercase tracking-[0.1em]">What each account type can do</h2>
      <table className="w-full" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--rule)" }}>
            {["Page", "Founder", "External practitioner", "PBA practitioner", "PBA admin"].map((h) => (
              <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--ink-secondary)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            ["Dashboard", "View", "View, published months only", "View", "View"],
            ["Uploads", "Upload, reply, “We have none”", "View, upload", "Accept, ask a question, not applicable", "Same as PBA practitioner"],
            ["Monthly close", "No access", "Upload MIS, submit", "Check, send back, publish", "Same"],
            ["Filings", "View", "Mark filed with proof", "Verify", "Same"],
            ["Files delivered", "View, download", "View", "View, upload", "Same"],
            ["Data room", "View, download", "Add events and documents", "Add events and documents", "Same"],
            ["Admin", "No access", "No access", "No access", "Full"],
          ].map((row) => (
            <tr key={row[0]} style={{ borderBottom: "1px solid var(--rule)" }}>
              {row.map((cell, i) => <td key={i} className="px-3 py-2 text-[12.5px]" style={{ fontWeight: i === 0 ? 700 : 400, color: cell === "No access" ? "var(--ink-secondary)" : "var(--ink)" }}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mb-2 mt-8 text-[13px] font-bold uppercase tracking-[0.1em]">Access changes</h2>
      <div className="p-4" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 10 }}>
        {log.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>Nothing recorded yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {log.map((l) => (
              <p key={l.id} className="text-[12.5px]" style={{ color: "var(--ink)" }}>
                <span style={{ color: "var(--ink-secondary)" }}>{new Date(l.at).toLocaleDateString()} · </span>{describe(l)}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
