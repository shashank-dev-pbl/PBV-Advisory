"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { UserMenu, type CurrentUser } from "../founder/FounderView";
import { verifyAndPublish, sendBackWithQuery, type PBAReviewData } from "./actions";
import { PERIOD_FIGURES_FIELDS, type PeriodFigures } from "@/lib/types";
import { formatPeriodLabel } from "@/lib/period";
import type { Company } from "@/lib/types";

const GROUPS: { label: string; fields: (typeof PERIOD_FIGURES_FIELDS)[number][] }[] = [
  { label: "Cash", fields: ["cash_opening", "cash_closing", "cash_restricted", "gross_burn", "net_burn", "expenses_accrual"] },
  { label: "Revenue", fields: ["revenue_total", "revenue_subscription", "revenue_service", "revenue_project", "partner_share_paid"] },
  { label: "Customers", fields: ["clients_active", "clients_added", "clients_lost", "top_client_revenue", "top5_client_revenue"] },
  { label: "Working capital", fields: ["receivables_total", "receivables_0_30", "receivables_31_60", "receivables_61_90", "receivables_90_plus", "payables_total", "billed_month", "collections_month"] },
];

const FIELD_LABELS: Record<string, string> = {
  cash_opening: "Cash at month start",
  cash_closing: "Cash at month end",
  cash_restricted: "Of which restricted",
  gross_burn: "Gross burn",
  net_burn: "Net burn",
  expenses_accrual: "Expenses (accrual)",
  revenue_total: "Net revenue",
  revenue_subscription: "— subscription",
  revenue_service: "— service",
  revenue_project: "— project",
  partner_share_paid: "Paid to revenue-share partners",
  clients_active: "Paying clients",
  clients_added: "Clients added",
  clients_lost: "Clients lost",
  top_client_revenue: "Largest client revenue",
  top5_client_revenue: "Top 5 clients combined",
  receivables_total: "Receivables",
  receivables_0_30: "— 0 to 30 days",
  receivables_31_60: "— 31 to 60 days",
  receivables_61_90: "— 61 to 90 days",
  receivables_90_plus: "— over 90 days",
  payables_total: "Payables",
  billed_month: "Billed in the month",
  collections_month: "Collected in the month",
};

function fmt(n: number | null) {
  if (n === null) return "—";
  return n.toLocaleString("en-IN");
}

function pctChange(current: number | null, prior: number | null): number | null {
  if (current === null || prior === null || prior === 0) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

export default function PBAView({
  company,
  currentUser,
  period,
  review,
}: {
  company: Company;
  currentUser: CurrentUser;
  period: string;
  review: PBAReviewData;
}) {
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
        <div className="flex items-center gap-4">
          <Link
            href="/year"
            className="btn-small"
            style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)", gap: 6 }}
          >
            <CalendarDays size={13} strokeWidth={1.75} />
            Year
          </Link>
          <UserMenu user={currentUser} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8">
        {review ? (
          <ReviewPanel period={period} review={review} />
        ) : (
          <p className="text-[14px]" style={{ color: "var(--ink-secondary)" }}>
            Nothing submitted for {formatPeriodLabel(period)} yet.
          </p>
        )}
      </main>
    </div>
  );
}

function ReviewPanel({ period, review }: { period: string; review: PBAReviewData }) {
  const [busy, setBusy] = useState(false);
  const [showQuery, setShowQuery] = useState(false);
  const [queryText, setQueryText] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  if (!review) return null;
  const { current, previous } = review;

  async function handleVerifyAndPublish() {
    setBusy(true);
    setErrorMsg("");
    try {
      await verifyAndPublish(current.id);
      window.location.reload();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed");
      setBusy(false);
    }
  }

  async function handleSendBack() {
    if (!queryText.trim()) return;
    setBusy(true);
    try {
      await sendBackWithQuery(current.id, queryText.trim());
      window.location.reload();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-6 p-4" style={{ background: "#fdf3dd", border: "1px solid #e3d4a8" }}>
        <p className="text-[13px]" style={{ color: "#6b5320" }}>
          <strong style={{ color: "#4d3c14" }}>Not yet visible to the founder.</strong> These figures were read out
          of the practitioner&apos;s workbook. Check them, then publish.
        </p>
      </div>

      <div className="mb-4 p-4 flex flex-wrap items-center gap-4" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)" }}>
        <div>
          <p className="text-[14px] font-bold" style={{ color: "var(--ink)" }}>{current.mis_upload?.filename ?? "MIS workbook"}</p>
          <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--ink-secondary)" }}>
            {formatPeriodLabel(period)} · uploaded {current.mis_upload ? new Date(current.mis_upload.uploaded_at).toLocaleString() : "—"}
          </p>
        </div>
      </div>

      {GROUPS.map((group) => (
        <div key={group.label} className="mb-6">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--bottomline-green)" }}>
            {group.label}
          </p>
          <table className="w-full" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderCollapse: "collapse" }}>
            <tbody>
              {group.fields.map((field) => {
                const cur = current[field as keyof PeriodFigures] as number | null;
                const prior = previous ? (previous[field as keyof PeriodFigures] as number | null) : null;
                const change = pctChange(cur, prior);
                const flagged = change !== null && Math.abs(change) > 25;
                return (
                  <tr key={field} style={{ borderBottom: "1px solid var(--rule)" }}>
                    <td className="px-3 py-2 text-[13px]" style={{ color: "var(--ink)" }}>{FIELD_LABELS[field] ?? field}</td>
                    <td className="px-3 py-2 text-right text-[13px] tnum" style={{ color: "var(--ink)" }}>{fmt(cur)}</td>
                    <td className="px-3 py-2 text-right text-[12px] tnum" style={{ color: "var(--ink-secondary)" }}>{fmt(prior)}</td>
                    <td className="px-3 py-2 text-right text-[12px] tnum" style={{ color: flagged ? "#8a6412" : "var(--ink-secondary)" }}>
                      {change === null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(0)}%`}
                      {flagged && <span className="ml-1.5 text-[10px] font-bold" style={{ background: "#fdf3dd", color: "#8a6412", padding: "2px 6px", borderRadius: 10 }}>Check</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      <div className="mb-6 p-4" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)" }}>
        <p className="text-[13px]" style={{ color: "var(--bottomline-green)" }}>✓ The workbook&apos;s own five checks all pass — enforced before this could be submitted.</p>
      </div>

      <div className="p-5" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)" }}>
        <p className="text-[15px] font-bold" style={{ color: "var(--ink)" }}>Publish {formatPeriodLabel(period)} to the founder</p>
        <p className="mt-1 mb-4 text-[13px]" style={{ color: "var(--ink-secondary)" }}>
          Publishing fills their dashboard and marks the month delivered.
        </p>

        {showQuery ? (
          <div className="flex flex-col gap-2">
            <textarea
              className="input-field"
              style={{ minHeight: 80 }}
              placeholder="What needs fixing?"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
            />
            <div className="flex gap-2">
              <button onClick={handleSendBack} disabled={busy || !queryText.trim()} className="btn-small" style={{ background: "var(--ink)", color: "var(--paper)", border: "1px solid var(--ink)" }}>
                Send back to practitioner
              </button>
              <button onClick={() => setShowQuery(false)} className="btn-small" style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)" }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleVerifyAndPublish}
              disabled={busy}
              className="btn-small"
              style={{ background: "var(--bottomline-green)", color: "var(--paper)", border: "1px solid var(--bottomline-green)" }}
            >
              {busy ? "Publishing…" : "Verify and publish"}
            </button>
            <button onClick={() => setShowQuery(true)} disabled={busy} className="btn-small" style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)" }}>
              Send back with a query
            </button>
            <button disabled className="btn-small" style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)", opacity: 0.6 }}>
              Hold
            </button>
          </div>
        )}
        {errorMsg && <p className="mt-3 text-[12.5px]" style={{ color: "#8c1a1a" }}>{errorMsg}</p>}
        <p className="mt-4 text-[11.5px]" style={{ color: "var(--ink-secondary)" }}>
          Verifying records your name and the time against this month. The account that submitted this can&apos;t also verify it.
        </p>
      </div>
    </>
  );
}
