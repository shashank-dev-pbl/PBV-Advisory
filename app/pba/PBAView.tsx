"use client";

import { UserMenu, type CurrentUser } from "../founder/FounderView";
import type { Company } from "@/lib/types";

// Placeholder for Phase 1 — proves sign-in + role gating works end-to-end.
// The real verify/publish workflow lands in Phases 2–4.
export default function PBAView({ company, currentUser }: { company: Company; currentUser: CurrentUser }) {
  return (
    <div className="min-h-screen" style={{ background: "var(--paper)" }}>
      <header
        className="flex items-center justify-between border-b px-5 py-4 md:px-8"
        style={{ borderColor: "var(--rule)" }}
      >
        <div>
          <p className="eyebrow" style={{ color: "var(--bottomline-green)" }}>Prime Bottomline Advisory</p>
          <h1 className="text-[18px] font-extrabold">{company?.name} <span style={{ color: "var(--bottomline-green)" }}>· PBA</span></h1>
        </div>
        <UserMenu user={currentUser} />
      </header>
      <main className="mx-auto w-full max-w-[720px] px-5 py-8 md:px-8">
        <p className="text-[14px]" style={{ color: "var(--ink-secondary)" }}>
          The verification and publish workflow lands in a later phase. You&apos;re signed in as PBA for {company?.name}.
        </p>
      </main>
    </div>
  );
}
