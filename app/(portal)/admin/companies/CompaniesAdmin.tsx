"use client";

import { unwrap } from "@/lib/actionResult";
import { adminError } from "@/lib/adminError";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createCompany, type CompanyRow } from "../actions";
import { switchCompany } from "../../actions";
import CompaniesTable from "../../CompaniesTable";
import type { CompanyOverview } from "@/lib/companies/overview";

const PLAN_LABEL: Record<string, string> = { starter: "Starter", builder: "Builder", operator: "Operator" };

export default function CompaniesAdmin({ rows, periodOptions }: { companies: CompanyRow[]; rows: CompanyOverview[]; periodOptions: { value: string; label: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [fy, setFy] = useState<"04" | "01">("04");
  const [plan, setPlan] = useState<"starter" | "builder" | "operator">("starter");
  const [first, setFirst] = useState(periodOptions[0]?.value ?? "");
  const [books, setBooks] = useState<"auditor" | "pba">("auditor");

  async function create() {
    setBusy(true);
    setError("");
    try {
      const id = unwrap(await createCompany({ name, fyStartMonth: fy, plan, firstCollectPeriod: first, booksBy: books }));
      await switchCompany(id);
      router.push(`/admin/companies?c=${id}`);
      router.refresh();
    } catch (e) {
      setError(adminError(e, "Could not create the company"));
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      <div className="px-[22px] pt-[18px]">
        <button onClick={() => setOpen((v) => !v)} className="btn-small" style={{ background: "var(--bottomline-green)", color: "var(--paper)", border: "1px solid var(--bottomline-green)" }}>
          + New company
        </button>
      </div>

      {open && (
        <div className="mx-[22px] mb-6 mt-4 p-4" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 10 }}>
          <p className="mb-3 text-[14px] font-bold">New company</p>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-[12px] font-semibold">Company name
              <input className="input-field mt-1" placeholder="As registered" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="text-[12px] font-semibold">Financial year starts
              <select className="input-field mt-1" value={fy} onChange={(e) => setFy(e.target.value as "04" | "01")}>
                <option value="04">April</option>
                <option value="01">January</option>
              </select>
            </label>
            <label className="text-[12px] font-semibold">Plan
              <select className="input-field mt-1" value={plan} onChange={(e) => setPlan(e.target.value as typeof plan)}>
                <option value="starter">Starter</option>
                <option value="builder">Builder</option>
                <option value="operator">Operator</option>
              </select>
              <span className="mt-1 block text-[11px] font-normal" style={{ color: "var(--ink-secondary)" }}>Recorded on the company. Every plan currently gets the full checklist.</span>
            </label>
            <label className="text-[12px] font-semibold">First month to collect
              <select className="input-field mt-1" value={first} onChange={(e) => setFirst(e.target.value)}>
                {periodOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="text-[12px] font-semibold md:col-span-2">Who keeps the books
              <select className="input-field mt-1" value={books} onChange={(e) => setBooks(e.target.value as "auditor" | "pba")}>
                <option value="auditor">Their existing auditor (external practitioner)</option>
                <option value="pba">Prime Bottomline</option>
              </select>
            </label>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={create} disabled={busy || !name.trim()} className="btn-small" style={{ background: "var(--bottomline-green)", color: "var(--paper)", border: "1px solid var(--bottomline-green)" }}>
              {busy ? "Creating…" : "Create company"}
            </button>
            <button onClick={() => setOpen(false)} className="btn-small" style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)" }}>Cancel</button>
            <span className="text-[12px]" style={{ color: "var(--ink-secondary)" }}>Next you add its people.</span>
          </div>
          {error && <p className="mt-3 text-[12.5px]" style={{ color: "#8c1a1a" }}>{error}</p>}
        </div>
      )}

      <CompaniesTable rows={rows} intro="Every company on the portal." manage />
    </div>
  );
}
