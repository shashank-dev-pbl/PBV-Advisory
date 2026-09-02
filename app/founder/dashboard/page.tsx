import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { currentPeriod, formatPeriodLabel } from "@/lib/period";
import { getFinancialsHistory } from "@/app/practitioner/financials-actions";
import FinancialTiles from "@/app/dashboard/FinancialTiles";
import { UserMenu } from "@/app/founder/FounderView";
import type { Company } from "@/lib/types";

export default async function FounderDashboardPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const supabase = await createClient();
  const { data: company } = await supabase.from("company").select("*").eq("id", appUser.company_id).single<Company>();

  const history = await getFinancialsHistory(appUser.company_id, currentPeriod(), 6);
  const publishedHistory = history.filter((m) => m.status === "published");

  return (
    <div className="min-h-screen" style={{ background: "var(--paper)" }}>
      <header className="flex items-center justify-between border-b px-5 py-4 md:px-8" style={{ borderColor: "var(--rule)" }}>
        <div>
          <p className="eyebrow mb-1">Dashboard</p>
          <h1 className="text-[22px] font-extrabold">{company?.name}</h1>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--ink-secondary)" }}>{formatPeriodLabel(currentPeriod())}</p>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/founder"
            className="btn-small"
            style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)", gap: 6 }}
          >
            <ArrowLeft size={13} strokeWidth={1.75} />
            Back to checklist
          </Link>
          <div style={{ width: 1, height: 28, background: "var(--rule)" }} />
          <UserMenu user={{ email: appUser.email, role: "founder" }} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8">
        <FinancialTiles history={publishedHistory} isPractitioner={false} />
      </main>
    </div>
  );
}
