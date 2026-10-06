import Link from "next/link";
import { pageGate } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";
import { currentPeriod, formatPeriodLabel, previousPeriods } from "@/lib/period";
import { getPublishedHistory } from "@/lib/periodFiguresView";
import { getObligations } from "@/app/year/actions";
import MockupTiles from "@/app/founder/dashboard/MockupTiles";
import DownloadLink from "@/app/founder/dashboard/DownloadLink";
import { CircularProgress } from "@/app/founder/FounderView";
import { isReceived } from "@/lib/docItemStatus";
import PageHeader from "../PageHeader";
import Locked from "../Locked";
import NoCompany from "../NoCompany";
import SettingUp from "../SettingUp";
import type { DocItem, PeriodFigures } from "@/lib/types";

export default async function DashboardPage() {
  const { session, locked } = await pageGate("dashboard");
  if (locked) return <Locked page="dashboard" who={session.who!} />;
  const company = session.company;
  if (!company) return <NoCompany page="dashboard" admin={session.who === "admin"} />;
  if (company.status === "setting_up") return <SettingUp page={"dashboard"} name={company.name} />;

  const supabase = await createClient();
  const period = currentPeriod();

  const [publishedHistory, { data: docItems }, { data: deliverableRows }, obligations] = await Promise.all([
    getPublishedHistory(company.id, period, 6),
    supabase.from("doc_item").select("*").eq("company_id", company.id).in("period", ["ONCE", period]),
    supabase
      .from("period_figures")
      .select("id, period, state, published_at, pdf_storage_path, pdf_filename")
      .eq("company_id", company.id)
      .in("period", previousPeriods(period, 6))
      .eq("state", "published")
      .order("period", { ascending: false }),
    getObligations(company.id),
  ]);

  const allDocItems = (docItems ?? []) as DocItem[];
  const mustItems = allDocItems.filter((i) => i.priority === "must");
  const mustResolved = mustItems.filter((i) => isReceived(i.status)).length;
  const mustTotal = mustItems.length;
  const outstanding = mustItems.filter((i) => !isReceived(i.status));
  const oldestOutstanding = outstanding.length
    ? [...outstanding].sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))[0]
    : null;

  // A "notice" only counts as open once someone has actually reported one (uploaded or asked a question
  // on that checklist item) — the item existing in pending state means nothing has been flagged yet.
  const openNoticeCount = allDocItems.filter(
    (i) => /notice|litigation/i.test(i.title) && (i.status === "uploaded" || i.status === "query")
  ).length;

  const deliverables = (deliverableRows ?? []) as Pick<PeriodFigures, "id" | "period" | "state" | "published_at" | "pdf_storage_path" | "pdf_filename">[];
  const latestDeliverable = deliverables[0] ?? null;
  const published = publishedHistory.filter((m) => m.status === "published");

  // The monthly cadence: the external practitioner uploads by day 7. "Due" is the month after the last one delivered.
  const [dueY, dueM] = (latestDeliverable ? latestDeliverable.period : period).split("-").map(Number);
  const duePeriodDate = new Date(dueY, dueM, 1);
  const duePeriodLabel = formatPeriodLabel(`${duePeriodDate.getFullYear()}-${String(duePeriodDate.getMonth() + 1).padStart(2, "0")}`);
  const nextMisDue = new Date(dueY, dueM + 1, 7);

  return (
    <>
      <PageHeader
        title={company.name}
        accent="Dashboard"
        sub={latestDeliverable
          ? `Figures for ${formatPeriodLabel(latestDeliverable.period)} · published ${latestDeliverable.published_at ? new Date(latestDeliverable.published_at).toLocaleDateString() : ""}`
          : formatPeriodLabel(period)}
      />
      <div className="mx-auto w-full max-w-[1100px] px-5 py-8 md:px-8">
        <div className="mb-8 grid gap-3.5 md:grid-cols-2">
          <div className="flex items-center gap-4 p-4" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 10 }}>
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
            <Link href="/uploads/month" className="btn-small" style={{ background: "var(--bottomline-green)", color: "var(--paper)", border: "1px solid var(--bottomline-green)", flexShrink: 0 }}>
              Upload
            </Link>
          </div>

          <div className="flex items-center gap-4 p-4" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 10 }}>
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full" style={{ background: "var(--bottomline-green)" }}>
              <span style={{ color: "var(--paper)", fontSize: 20 }}>✓</span>
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

        {published.length === 0 ? (
          <div className="p-6 text-center" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 10 }}>
            <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>
              Your first set of numbers will appear here once we complete the {formatPeriodLabel(period)} close.
            </p>
          </div>
        ) : (
          <MockupTiles history={published} obligations={obligations} openNoticeCount={openNoticeCount} />
        )}

        {deliverables.length > 0 && (
          <section id="deliverables" className="mt-10">
            <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--ink)" }}>Everything we have given you</p>
            <table className="w-full" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderCollapse: "separate", borderRadius: 10, overflow: "hidden" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--rule)" }}>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--ink-secondary)" }}>Document</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--ink-secondary)" }}>For</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--ink-secondary)" }}>Delivered</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--ink-secondary)" }}></th>
                </tr>
              </thead>
              <tbody>
                {deliverables.map((d, i) => (
                  <tr key={d.id} style={{ borderBottom: i < deliverables.length - 1 ? "1px solid var(--rule)" : "none" }}>
                    <td className="px-4 py-3">
                      <p className="text-[13.5px] font-bold" style={{ color: "var(--ink)" }}>Monthly MIS</p>
                      <p className="text-[12px]" style={{ color: "var(--ink-secondary)" }}>P&amp;L, cash flow, working capital, and customer figures</p>
                    </td>
                    <td className="px-4 py-3 text-[13px]" style={{ color: "var(--ink)" }}>{formatPeriodLabel(d.period)}</td>
                    <td className="px-4 py-3 text-[13px]" style={{ color: "var(--ink)" }}>{d.published_at ? new Date(d.published_at).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="flex-shrink-0"
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: "3px 9px",
                            borderRadius: 20,
                            background: i === 0 ? "var(--bottomline-green)" : "var(--paper)",
                            color: i === 0 ? "var(--paper)" : "var(--ink-secondary)",
                          }}
                        >
                          {i === 0 ? "New" : "Opened"}
                        </span>
                        {d.pdf_storage_path ? (
                          <DownloadLink storagePath={d.pdf_storage_path} />
                        ) : (
                          <span className="text-[12px]" style={{ color: "var(--ink-secondary)" }}>Not yet available</span>
                        )}
                      </div>
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
        <p className="mt-10 text-center text-[11.5px]" style={{ color: "var(--ink-secondary)" }}>
          Figures prepared by the company&apos;s external practitioner and presented by Prime Bottomline Advisory.
        </p>
      </div>
    </>
  );
}
