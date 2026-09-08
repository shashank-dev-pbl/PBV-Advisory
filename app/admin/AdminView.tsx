"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createCompanyWithUsers, runMonthlySeed, addTeamMember } from "./actions";
import type { Company, AppUser, Role } from "@/lib/types";

type CompanyStat = { company: Company; total: number; received: number; users: AppUser[] };

export default function AdminView({ companies }: { companies: CompanyStat[] }) {
  const [companyName, setCompanyName] = useState("");
  const [founderPhone, setFounderPhone] = useState("");
  const [founderEmail, setFounderEmail] = useState("");
  const [practitionerPhone, setPractitionerPhone] = useState("");
  const [practitionerEmail, setPractitionerEmail] = useState("");
  const [practitionerFirmName, setPractitionerFirmName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const [memberCompanyId, setMemberCompanyId] = useState("");
  const [memberPhone, setMemberPhone] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<Role>("pba");
  const [memberFirmName, setMemberFirmName] = useState("");
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberMessage, setMemberMessage] = useState("");

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
      await createCompanyWithUsers({
        companyName,
        founderPhone,
        founderEmail,
        practitionerPhone,
        practitionerEmail,
        practitionerFirmName,
      });
      setMessage(`${companyName} onboarded — checklist seeded. Founder and practitioner complete their profile on first sign-in.`);
      setCompanyName("");
      setFounderPhone("");
      setFounderEmail("");
      setPractitionerPhone("");
      setPractitionerEmail("");
      setPractitionerFirmName("");
      window.location.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    setMemberBusy(true);
    setMemberMessage("");
    try {
      await addTeamMember({
        companyId: memberCompanyId,
        phone: memberPhone,
        email: memberEmail,
        role: memberRole,
        firmName: memberFirmName,
      });
      setMemberMessage("Added — they complete their profile on first sign-in.");
      setMemberPhone("");
      setMemberEmail("");
      setMemberFirmName("");
      window.location.reload();
    } catch (err) {
      setMemberMessage(err instanceof Error ? err.message : "Failed");
    } finally {
      setMemberBusy(false);
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
            <input className="input-field" placeholder="Company name" required value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <input className="input-field" placeholder="Founder phone (+91…)" required value={founderPhone} onChange={(e) => setFounderPhone(e.target.value)} />
              <input className="input-field" placeholder="Founder email" type="email" required value={founderEmail} onChange={(e) => setFounderEmail(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input className="input-field" placeholder="Practitioner phone (+91…)" required value={practitionerPhone} onChange={(e) => setPractitionerPhone(e.target.value)} />
              <input className="input-field" placeholder="Practitioner email" type="email" required value={practitionerEmail} onChange={(e) => setPractitionerEmail(e.target.value)} />
            </div>
            <input className="input-field" placeholder="Practitioner firm name (e.g. SPARC & Co)" value={practitionerFirmName} onChange={(e) => setPractitionerFirmName(e.target.value)} />
            <button type="submit" disabled={busy} className="btn-primary self-start">
              {busy ? "Creating…" : "Create company + seed checklist"}
            </button>
            {message && <p className="text-[12px]" style={{ color: "var(--ink-secondary)" }}>{message}</p>}
          </form>
        </section>

        <section className="mb-10">
          <p className="mb-3 eyebrow">Add a team member to an existing company</p>
          <form onSubmit={handleAddMember} className="flex flex-col gap-3 p-5" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)" }}>
            <select className="input-field" required value={memberCompanyId} onChange={(e) => setMemberCompanyId(e.target.value)}>
              <option value="">Select company…</option>
              {companies.map(({ company }) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input className="input-field" placeholder="Phone (+91…)" required value={memberPhone} onChange={(e) => setMemberPhone(e.target.value)} />
              <input className="input-field" placeholder="Email" type="email" required value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select className="input-field" value={memberRole} onChange={(e) => setMemberRole(e.target.value as Role)}>
                <option value="pba">PBA</option>
                <option value="practitioner">Practitioner</option>
                <option value="founder">Founder</option>
              </select>
              <input className="input-field" placeholder="Firm name (practitioner/PBA)" value={memberFirmName} onChange={(e) => setMemberFirmName(e.target.value)} />
            </div>
            <button type="submit" disabled={memberBusy} className="btn-primary self-start">
              {memberBusy ? "Adding…" : "Add team member"}
            </button>
            {memberMessage && <p className="text-[12px]" style={{ color: "var(--ink-secondary)" }}>{memberMessage}</p>}
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
                      {u.role}: {u.name ? `${u.name} · ` : ""}{u.email}
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
