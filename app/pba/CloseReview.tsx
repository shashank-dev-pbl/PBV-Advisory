"use client";

import { useState } from "react";
import Link from "next/link";
import { verifyAndPublish, sendBackWithQuery, requestCorrection, type MonthRow, type PBAReviewData } from "./actions";
import { PERIOD_FIGURES_FIELDS, type PeriodFigures } from "@/lib/types";
import { formatPeriodLabel } from "@/lib/period";

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


const STATE_CHIP: Record<string, { label: string; bg: string; color: string }> = {
  submitted: { label: "Submitted · waiting for PBA", bg: "rgba(184,134,11,0.14)", color: "#7a5a00" },
  published: { label: "Published", bg: "var(--bottomline-green)", color: "#fff" },
  returned: { label: "Sent back to SPARC", bg: "rgba(140,26,26,0.1)", color: "#8c1a1a" },
  correction: { label: "Published · correction requested", bg: "rgba(184,134,11,0.14)", color: "#7a5a00" },
  draft: { label: "With SPARC · not submitted", bg: "rgba(107,99,87,0.14)", color: "var(--ink-secondary)" },
};

function chipFor(m: Pick<MonthRow, "state" | "query_text">) {
  if (m.state === "submitted") return STATE_CHIP.submitted;
  if (m.state === "published") return m.query_text ? STATE_CHIP.correction : STATE_CHIP.published;
  if (m.state === "draft" && m.query_text) return STATE_CHIP.returned;
  return STATE_CHIP.draft;
}

export default function CloseReview({
  months,
  selectedId,
  review,
  currentUserId,
}: {
  months: MonthRow[];
  selectedId: string | null;
  review: PBAReviewData;
  currentUserId: string;
}) {
  return (
    <div className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8">
      <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--ink)" }}>Every month</p>
      {months.length === 0 ? (
        <p className="text-[14px]" style={{ color: "var(--ink-secondary)" }}>Nothing has been uploaded for this company yet.</p>
      ) : (
        <table className="mb-8 w-full" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--rule)" }}>
              {["Month", "Workbook", "Status", ""].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--ink-secondary)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {months.map((m) => {
              const chip = chipFor(m);
              const on = m.id === selectedId;
              return (
                <tr key={m.id} style={{ borderBottom: "1px solid var(--rule)", background: on ? "rgba(0,77,0,0.05)" : "transparent" }}>
                  <td className="px-3 py-2.5 text-[13.5px] font-bold" style={{ color: "var(--ink)" }}>{formatPeriodLabel(m.period)}{m.version > 1 ? ` · v${m.version}` : ""}</td>
                  <td className="px-3 py-2.5 text-[12.5px]" style={{ color: "var(--ink-secondary)" }}>{m.filename ?? "—"}</td>
                  <td className="px-3 py-2.5"><span className="pill" style={{ background: chip.bg, color: chip.color }}>{chip.label}</span></td>
                  <td className="px-3 py-2.5 text-right">
                    {!on && <Link href={`/close?m=${m.id}`} className="text-[12.5px] font-semibold" style={{ color: "var(--bottomline-green)" }}>Open</Link>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {review && <ReviewPanel key={review.current.id} review={review} currentUserId={currentUserId} />}
    </div>
  );
}

function ReviewPanel({ review, currentUserId }: { review: NonNullable<PBAReviewData>; currentUserId: string }) {
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"none" | "query" | "correction">("none");
  const [text, setText] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const { current, previous } = review;
  const period = current.period;
  const isSubmitted = current.state === "submitted";
  const isPublished = current.state === "published";
  const submittedBySelf = current.submitted_by === currentUserId;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setErrorMsg("");
    try {
      await fn();
      window.location.reload();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <>
      <h2 className="mb-3 text-[16px] font-extrabold">{formatPeriodLabel(period)} close</h2>

      {isSubmitted && (
        <div className="mb-6 p-4" style={{ background: "#fdf3dd", border: "1px solid #e3d4a8" }}>
          <p className="text-[13px]" style={{ color: "#6b5320" }}>
            <strong style={{ color: "#4d3c14" }}>Not yet visible to the founder.</strong> These figures were read out
            of the external practitioner&apos;s workbook. Check them against last month, then publish.
          </p>
        </div>
      )}
      {current.state === "draft" && (
        <div className="mb-6 p-4" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)" }}>
          <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>
            {current.query_text ? "Sent back. Waiting for the external practitioner to reply or upload a corrected workbook." : "Still with the external practitioner — not submitted yet."}
          </p>
          {current.query_text && <p className="mt-2 text-[13px]" style={{ color: "var(--ink)" }}>&ldquo;{current.query_text}&rdquo;</p>}
        </div>
      )}

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
        {isPublished ? (
          <>
            <p className="text-[15px] font-bold" style={{ color: "var(--ink)" }}>
              Published to the founder{current.published_at ? ` on ${new Date(current.published_at).toLocaleDateString()}` : ""}
            </p>
            {current.query_text ? (
              <p className="mt-2 text-[13px]" style={{ color: "var(--ink-secondary)" }}>
                Correction requested: &ldquo;{current.query_text}&rdquo;. The founder keeps seeing this version until a corrected workbook is submitted and published.
              </p>
            ) : mode === "correction" ? (
              <div className="mt-3 flex flex-col gap-2">
                <textarea className="input-field" style={{ minHeight: 80 }} placeholder="What needs correcting?" value={text} onChange={(e) => setText(e.target.value)} />
                <div className="flex gap-2">
                  <button onClick={() => run(() => requestCorrection(current.id, text))} disabled={busy || !text.trim()} className="btn-small" style={{ background: "var(--ink)", color: "var(--paper)", border: "1px solid var(--ink)" }}>
                    Ask for a corrected workbook
                  </button>
                  <button onClick={() => setMode("none")} className="btn-small" style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)" }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <button onClick={() => setMode("correction")} className="btn-small" style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)" }}>
                  Republish with corrected figures
                </button>
                <p className="mt-2 text-[12px]" style={{ color: "var(--ink-secondary)" }}>
                  Published figures stay as the practitioner submitted them. This asks them for a corrected workbook, which you then check and publish in its place. The earlier version is kept.
                </p>
              </div>
            )}
          </>
        ) : isSubmitted ? (
          <>
            <p className="text-[15px] font-bold" style={{ color: "var(--ink)" }}>Publish {formatPeriodLabel(period)} to the founder</p>
            <p className="mt-1 mb-4 text-[13px]" style={{ color: "var(--ink-secondary)" }}>
              Publishing fills their dashboard and marks the month delivered.
            </p>
            {mode === "query" ? (
              <div className="flex flex-col gap-2">
                <textarea className="input-field" style={{ minHeight: 80 }} placeholder="What needs fixing?" value={text} onChange={(e) => setText(e.target.value)} />
                <div className="flex gap-2">
                  <button onClick={() => run(() => sendBackWithQuery(current.id, text.trim()))} disabled={busy || !text.trim()} className="btn-small" style={{ background: "var(--ink)", color: "var(--paper)", border: "1px solid var(--ink)" }}>
                    Send back to the practitioner
                  </button>
                  <button onClick={() => setMode("none")} className="btn-small" style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)" }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => run(() => verifyAndPublish(current.id))}
                  disabled={busy || submittedBySelf}
                  className="btn-small"
                  style={{ background: submittedBySelf ? "var(--rule)" : "var(--bottomline-green)", color: "var(--paper)", border: "1px solid " + (submittedBySelf ? "var(--rule)" : "var(--bottomline-green)"), cursor: submittedBySelf ? "not-allowed" : "pointer" }}
                >
                  {busy ? "Publishing…" : "Verify and publish"}
                </button>
                <button onClick={() => setMode("query")} disabled={busy} className="btn-small" style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)" }}>
                  Send back with a query
                </button>
                <button disabled className="btn-small" style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)", opacity: 0.6 }}>
                  Hold
                </button>
              </div>
            )}
            <p className="mt-4 text-[11.5px]" style={{ color: "var(--ink-secondary)" }}>
              {submittedBySelf
                ? "You submitted this month, so you can't publish it. Whoever submits a month can never be the one who publishes it."
                : "You can publish this because you did not submit it. Whoever submits a month can never be the one who publishes it."}
            </p>
          </>
        ) : (
          <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>Nothing for PBA to do on this month yet.</p>
        )}
        {errorMsg && <p className="mt-3 text-[12.5px]" style={{ color: "#8c1a1a" }}>{errorMsg}</p>}
      </div>
      <p className="mt-4 text-[11.5px]" style={{ color: "var(--ink-secondary)" }}>
        Figures remain the external practitioner&apos;s. PBA&apos;s record is that they were checked and presented. Earlier versions of a republished month are kept but not shown to the founder.
      </p>
    </>
  );
}
