import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentAppUser, needsOnboarding, DEV_BYPASS_AUTH } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { currentPeriod, formatPeriodLabel, previousPeriods } from "@/lib/period";
import { getPublishedHistory } from "@/lib/periodFiguresView";
import FinancialTiles from "@/app/dashboard/FinancialTiles";
import { UserMenu, CircularProgress } from "@/app/founder/FounderView";
import { isReceived } from "@/lib/docItemStatus";
import DownloadLink from "./DownloadLink";
import type { Company, DocItem, PeriodFigures } from "@/lib/types";

export default async function FounderDashboardPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (needsOnboarding(appUser)) redirect("/onboarding");
  if (!DEV_BYPASS_AUTH && appUser.role !== "founder") redirect("/");

  const supabase = await createClient();
  const period = currentPeriod();

  const [{ data: company }, publishedHistory, { data: docItems }, { data: deliverableRows }] = await Promise.all([
    supabase.from("company").select("*").eq("id", appUser.company_id).single<Company>(),
    getPublishedHistory(appUser.company_id, period, 6),
    supabase
      .from("doc_item")
      .select("*")
      .eq("company_id", appUser.company_id)
      .in("period", ["ONCE", period]),
    supabase
      .from("period_figures")
      .select("id, period, state, published_at, pdf_storage_path, pdf_filename")
      .eq("company_id", appUser.company_id)
      .in("period", previousPeriods(period, 6))
      .eq("state", "published")
      .order("period", { ascending: false }),
  ]);

  const mustItems = ((docItems ?? []) as DocItem[]).filter((i) => i.priority === "must");
  const mustResolved = mustItems.filter((i) => isReceived(i.status)).length;
  const mustTotal = mustItems.length;
  const outstanding = mustItems.filter((i) => !isReceived(i.status));
  const oldestOutstanding = outstanding.length
    ? [...outstanding].sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))[0]
    : null;

  const deliverables = (deliverableRows ?? []) as Pick<PeriodFigures, "id" | "period" | "state" | "published_at" | "pdf_storage_path" | "pdf_filename">[];
  const latestDeliverable = deliverables[0] ?? null;

  // The monthly cadence per the close schedule: practitioner uploads by day 7.
  // "Due" always refers to the month right after whatever was last delivered
  // (or the current month, if nothing has been delivered yet).
  const [dueY, dueM] = (latestDeliverable ? latestDeliverable.period : period).split("-").map(Number);
  const duePeriodDate = new Date(dueY, dueM, 1); // one month after the reference period
  const duePeriodLabel = formatPeriodLabel(`${duePeriodDate.getFullYear()}-${String(duePeriodDate.getMonth() + 1).padStart(2, "0")}`);
  const nextMisDue = new Date(dueY, dueM + 1, 7);

  return (
    <div className="min-h-screen" style={{ background: "var(--paper)" }}>
      <header className="flex items-center justify-between border-b px-5 py-4 md:px-8" style={{ borderColor: "var(--rule)" }}>
        <div>
          <p className="eyebrow mb-1" style={{ color: "var(--bottomline-green)" }}>Prime Bottomline Advisory</p>
          <h1 className="text-[22px] font-extrabold">{company?.name} <span style={{ color: "var(--bottomline-green)" }}>· Founder</span></h1>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--ink-secondary)" }}>
            {latestDeliverable
              ? `Figures for ${formatPeriodLabel(latestDeliverable.period)} · published ${latestDeliverable.published_at ? new Date(latestDeliverable.published_at).toLocaleDateString() : ""}`
              : formatPeriodLabel(period)}
          </p>
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
          <UserMenu user={{ name: appUser.name, position: appUser.position, role: "founder" }} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8">
        <div className="mb-8 grid gap-3 md:grid-cols-2">
          <div className="flex items-center gap-4 p-4" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)" }}>
            <CircularProgress pct={mustTotal > 0 ? Math.round((mustResolved / mustTotal) * 100) : 0} label={`${mustResolved}/${mustTotal}`} />
            <div className="flex-1">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.06em]" style={{ color: "var(--ink-secondary)" }}>What we need from you</p>
              <p className="mt-0.5 text-[14px] font-bold" style={{ color: "var(--ink)" }}>
                {outstanding.length === 0 ? "Nothing outstanding" : `${outstanding.length} item${outstanding.length === 1 ? "" : "s"} still open for ${formatPeriodLabel(period)}`}
              </p>
              {oldestOutstanding && (
                <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--ink-secondary)" }}>
                  {oldestOutstanding.title}{oldestOutstanding.due_date ? ` · due ${new Date(oldestOutstanding.due_date).toLocaleDateString()}` : ""}
                </p>
              )}
            </div>
            <Link href="/founder" className="btn-small" style={{ background: "var(--bottomline-green)", color: "var(--paper)", border: "1px solid var(--bottomline-green)", flexShrink: 0 }}>
              Upload
            </Link>
          </div>

          <div className="flex items-center gap-4 p-4" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)" }}>
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full" style={{ background: "var(--green-soft, #e8efe6)" }}>
              <span style={{ color: "var(--bottomline-green)", fontSize: 20 }}>✓</span>
            </div>
            <div className="flex-1">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.06em]" style={{ color: "var(--ink-secondary)" }}>What you get from us</p>
              <p className="mt-0.5 text-[14px] font-bold" style={{ color: "var(--ink)" }}>
                {latestDeliverable ? `${formatPeriodLabel(latestDeliverable.period)} MIS delivered` : "Nothing delivered yet"}
              </p>
              <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--ink-secondary)" }}>
                {duePeriodLabel} MIS due {nextMisDue.toLocaleDateString()}
              </p>
            </div>
            {deliverables.length > 0 && (
              <a href="#deliverables" className="btn-small" style={{ background: "transparent", border: "1px solid var(--bottomline-green)", color: "var(--bottomline-green)", flexShrink: 0 }}>
                See files
              </a>
            )}
          </div>
        </div>

        <FinancialTiles history={publishedHistory} isPractitioner={false} />

        {deliverables.length > 0 && (
          <section id="deliverables" className="mt-10">
            <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--ink)" }}>Everything we have given you</p>
            <table className="w-full" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--rule)" }}>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--ink-secondary)" }}>Document</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--ink-secondary)" }}>For</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--ink-secondary)" }}>Delivered</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--ink-secondary)" }}></th>
                </tr>
              </thead>
              <tbody>
                {deliverables.map((d) => (
                  <tr key={d.id} style={{ borderBottom: "1px solid var(--rule)" }}>
                    <td className="px-3 py-2">
                      <p className="text-[13.5px] font-bold" style={{ color: "var(--ink)" }}>Monthly MIS</p>
                      <p className="text-[11.5px]" style={{ color: "var(--ink-secondary)" }}>P&amp;L, cash flow, working capital, and customer figures</p>
                    </td>
                    <td className="px-3 py-2 text-[13px]" style={{ color: "var(--ink)" }}>{formatPeriodLabel(d.period)}</td>
                    <td className="px-3 py-2 text-[13px]" style={{ color: "var(--ink)" }}>{d.published_at ? new Date(d.published_at).toLocaleDateString() : "—"}</td>
                    <td className="px-3 py-2">
                      {d.pdf_storage_path ? (
                        <DownloadLink storagePath={d.pdf_storage_path} />
                      ) : (
                        <span className="text-[12px]" style={{ color: "var(--ink-secondary)" }}>Not yet available</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {latestDeliverable && (
          <p className="mt-8 text-[12px] text-center" style={{ color: "var(--ink-secondary)" }}>
            Every number on this page comes from the {formatPeriodLabel(latestDeliverable.period)} close. Nothing here is a forecast.
          </p>
        )}
      </main>
    </div>
  );
}
