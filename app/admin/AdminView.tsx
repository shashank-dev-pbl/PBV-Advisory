"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createCompanyWithUsers, runMonthlySeed } from "./actions";
import type { Company, AppUser } from "@/lib/types";

type CompanyStat = { company: Company; total: number; received: number; users: AppUser[] };

export default function AdminView({ companies }: { companies: CompanyStat[] }) {
  const [companyName, setCompanyName] = useState("");
  const [founderName, setFounderName] = useState("");
  const [founderEmail, setFounderEmail] = useState("");
  const [practitionerName, setPractitionerName] = useState("");
  const [practitionerEmail, setPractitionerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await createCompanyWithUsers({ companyName, founderName, founderEmail, practitionerName, practitionerEmail });
      setMessage(`${companyName} onboarded — 47 items seeded.`);
      setCompanyName("");
      setFounderName("");
      setFounderEmail("");
      setPractitionerName("");
      setPractitionerEmail("");
      window.location.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleReseed(companyId: string) {
    setBusy(true);
    await runMonthlySeed(companyId);
    setBusy(false);
    window.location.reload();
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--paper)" }}>
      <header
        className="flex items-center justify-between border-b px-5 py-4 md:px-8"
        style={{ borderColor: "var(--rule)" }}
      >
        <h1 className="text-[16px] font-extrabold">Admin</h1>
        <button onClick={handleSignOut} className="text-[12px] font-semibold" style={{ color: "var(--ink-secondary)" }}>
          Sign out
        </button>
      </header>

      <main className="mx-auto w-full max-w-[720px] px-5 py-8 md:px-8">
        <section className="mb-10">
          <p className="mb-3 eyebrow">Onboard a new company</p>
          <form onSubmit={handleCreate} className="flex flex-col gap-3 p-5" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)" }}>
            <input className="input-field" placeholder="Company name (e.g. Xploro)" required value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <input className="input-field" placeholder="Founder name" required value={founderName} onChange={(e) => setFounderName(e.target.value)} />
              <input className="input-field" placeholder="Founder email" type="email" required value={founderEmail} onChange={(e) => setFounderEmail(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input className="input-field" placeholder="Practitioner name" required value={practitionerName} onChange={(e) => setPractitionerName(e.target.value)} />
              <input className="input-field" placeholder="Practitioner email" type="email" required value={practitionerEmail} onChange={(e) => setPractitionerEmail(e.target.value)} />
            </div>
            <button type="submit" disabled={busy} className="btn-primary self-start">
              {busy ? "Creating…" : "Create company + seed checklist"}
            </button>
            {message && <p className="text-[12px]" style={{ color: "var(--ink-secondary)" }}>{message}</p>}
          </form>
        </section>

        <section>
          <p className="mb-3 eyebrow">Companies</p>
          <div className="flex flex-col gap-3">
            {companies.map(({ company, total, received, users }) => (
              <div key={company.id} className="p-4" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)" }}>
                <div className="flex items-center justify-between">
                  <p className="text-[14px] font-bold">{company.name}</p>
                  <p className="text-[12px] tnum" style={{ color: "var(--ink-secondary)" }}>{received} of {total} received</p>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {users.map((u) => (
                    <span key={u.id} className="pill" style={{ background: "var(--paper)", border: "1px solid var(--rule)", color: "var(--ink-secondary)" }}>
                      {u.role}: {u.email}
                    </span>
                  ))}
                </div>
                <button onClick={() => handleReseed(company.id)} disabled={busy} className="btn-small mt-3" style={{ background: "transparent", border: "1px solid var(--ink)", color: "var(--ink)" }}>
                  Re-run this month&apos;s seed
                </button>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
