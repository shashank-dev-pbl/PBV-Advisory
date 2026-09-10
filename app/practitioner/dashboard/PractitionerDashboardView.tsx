"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { formatPeriodLabel } from "@/lib/period";
import FinancialTiles from "@/app/dashboard/FinancialTiles";
import { UserMenu, type CurrentUser } from "@/app/founder/FounderView";
import type { Company, MonthlyFinancials } from "@/lib/types";

export default function PractitionerDashboardView({
  company,
  period,
  history,
  currentUser,
}: {
  company: Company;
  period: string;
  history: MonthlyFinancials[];
  currentUser: CurrentUser;
}) {
  return (
    <div className="min-h-screen" style={{ background: "var(--paper)" }}>
      <header className="flex items-center justify-between border-b px-5 py-4 md:px-8" style={{ borderColor: "var(--rule)" }}>
        <div>
          <p className="eyebrow mb-1">Dashboard</p>
          <h1 className="text-[22px] font-extrabold">{company.name}</h1>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--ink-secondary)" }}>{formatPeriodLabel(period)}</p>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/practitioner"
            className="btn-small"
            style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)", gap: 6 }}
          >
            <ArrowLeft size={13} strokeWidth={1.75} />
            Back to practitioner desk
          </Link>
          <div style={{ width: 1, height: 28, background: "var(--rule)" }} />
          <UserMenu user={currentUser} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8">
        <p className="mb-6 text-[12.5px]" style={{ color: "var(--ink-secondary)" }}>
          This month&apos;s figures come from the MIS workbook uploaded on the{" "}
          <Link href="/practitioner" className="font-semibold" style={{ color: "var(--bottomline-green)" }}>practitioner desk</Link>
          . This view shows published history only — nothing here is editable.
        </p>
        <FinancialTiles history={history} isPractitioner />
      </main>
    </div>
  );
}
