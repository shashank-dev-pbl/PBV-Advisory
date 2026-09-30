import { formatPeriodLabel, currentPeriod } from "@/lib/period";
import {
  runwayMonths,
  changeVsLastMonth,
  concentration,
  collectionDays,
  collectionEfficiency,
} from "@/lib/dashboardCalc";
import type { MonthlyFinancials, Obligation } from "@/lib/types";

// Mirrors mockup "01 — Founder Dashboard.html"'s own number style (1 decimal
// place on lakhs/crores) rather than the shared formatINR's 2 decimals —
// scoped to this page only so it doesn't change formatting anywhere else.
function fmtL(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(1)}Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(1)}L`;
  return `${sign}₹${abs.toLocaleString("en-IN")}`;
}

function Tile({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={wide ? "col-span-2" : undefined}
      style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 10, padding: "15px 16px 16px" }}
    >
      <p className="mb-2 text-[12.5px]" style={{ color: "var(--ink-secondary)" }}>{label}</p>
      {children}
    </div>
  );
}

function Num({ children, red }: { children: React.ReactNode; red?: boolean }) {
  return (
    <p className="tnum" style={{ fontSize: 26, fontWeight: 650, letterSpacing: "-0.02em", lineHeight: 1.1, color: red ? "#8c1a1a" : "var(--ink)" }}>
      {children}
    </p>
  );
}

function Meta({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-[12px]" style={{ color: "var(--ink-secondary)" }}>{children}</p>;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 mt-8 text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--ink-secondary)" }}>
      {children}
    </h2>
  );
}

function Sparkline({ values }: { values: (number | null)[] }) {
  const present = values.filter((v): v is number => v !== null);
  if (present.length < 2) return <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>—</p>;
  const min = Math.min(...present);
  const max = Math.max(...present);
  const range = max - min || 1;
  const step = 200 / (values.length - 1);
  const points = values
    .map((v, i) => (v === null ? null : `${i * step},${52 - ((v - min) / range) * 44}`))
    .filter((p): p is string => p !== null)
    .join(" ");
  const lastIdx = values.map((v) => v !== null).lastIndexOf(true);
  const [lastX, lastY] = points.split(" ").pop()!.split(",");
  const first = present[0];
  const last = present[present.length - 1];
  return (
    <>
      <svg viewBox="0 0 200 60" width="100%" height={58} role="img" aria-label={`Cash balance trend, ${fmtL(first)} to ${fmtL(last)}`}>
        <line x1={0} y1={52} x2={200} y2={52} stroke="var(--rule)" strokeWidth={1} />
        <polyline points={points} fill="none" stroke="var(--bottomline-green)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={lastX} cy={lastY} r={4} fill="var(--bottomline-green)" stroke="var(--paper-deep)" strokeWidth={2} />
      </svg>
      <Meta>{formatPeriodLabel(currentPeriod()).slice(0, 3)}{lastIdx > 0 ? "" : ""} {fmtL(first)} → {fmtL(last)}</Meta>
    </>
  );
}

const MIX_COLORS: Record<string, string> = { service: "#1baf7a", subscription: "#2a78d6", project: "#eb6834" };
const AGE_COLORS = ["#2a78d6", "#5598e7", "#9ec5f4", "#d03b3b"];

export default function MockupTiles({
  history,
  obligations,
  openNoticeCount,
}: {
  history: MonthlyFinancials[]; // published only, oldest first, up to 6 months
  obligations: Obligation[];
  openNoticeCount: number;
}) {
  const latest = history[history.length - 1] ?? null;
  const prev = history[history.length - 2] ?? null;

  if (!latest) return null;

  const { months: runway } = runwayMonths(history);
  const netBurnChange = changeVsLastMonth(history, "net_burn");
  const revenueChange = changeVsLastMonth(history, "revenue_total");
  const conc = concentration(latest);
  const collDays = collectionDays(latest);
  const collEff = collectionEfficiency(latest);

  const revenueParts = [
    { key: "service", label: "Service", value: latest.revenue_service },
    { key: "subscription", label: "Subscription", value: latest.revenue_subscription },
    { key: "project", label: "Project", value: latest.revenue_project },
  ]
    .filter((p) => p.value !== null && p.value > 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const revenueTotal = latest.revenue_total || 1;

  const subscriptionPct = latest.revenue_subscription !== null ? (latest.revenue_subscription / revenueTotal) * 100 : null;
  const subscriptionPctPrev = prev?.revenue_subscription !== null && prev?.revenue_total ? ((prev.revenue_subscription ?? 0) / prev.revenue_total) * 100 : null;

  const ageBuckets = [
    { label: "0–30", value: latest.receivables_0_30 },
    { label: "31–60", value: latest.receivables_31_60 },
    { label: "61–90", value: latest.receivables_61_90 },
    { label: "90+", value: latest.receivables_90_plus },
  ];
  const receivablesTotal = latest.receivables_total || 1;

  const today = new Date();
  const in30 = new Date();
  in30.setDate(today.getDate() + 30);
  const isOverdue = obligations.some((o) => o.status === "pending" && new Date(o.due_override ?? o.statutory_due_date) < today);
  const dueNext30 = obligations.filter(
    (o) => o.status !== "verified" && new Date(o.due_override ?? o.statutory_due_date) >= today && new Date(o.due_override ?? o.statutory_due_date) <= in30
  );

  return (
    <>
      <SectionHeading>Cash and survival</SectionHeading>
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <Tile label="Cash in bank">
          <Num>{fmtL(latest.cash_closing)}</Num>
          {latest.cash_restricted ? <Meta>{fmtL(latest.cash_restricted)} of this is not freely available</Meta> : null}
        </Tile>
        <Tile label="Runway">
          {runway === null ? <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>— (needs 3 months)</p> : <Num red={runway < 4}>{runway.toFixed(1)} months</Num>}
          <Meta>On the last 3 months&apos; average net burn</Meta>
        </Tile>
        <Tile label="Net burn this month">
          <Num>{fmtL(latest.net_burn)}</Num>
          {netBurnChange !== null && prev && (
            <Meta>
              <span style={{ color: netBurnChange <= 0 ? "var(--status-accepted)" : "#8c1a1a", fontWeight: 600 }}>
                {netBurnChange <= 0 ? "▼" : "▲"} {fmtL(Math.abs(netBurnChange))}
              </span>{" "}
              on {formatPeriodLabel(prev.period).split(" ")[0]}
            </Meta>
          )}
        </Tile>
        <Tile label="Cash, last 6 months">
          <Sparkline values={history.map((m) => m.cash_closing)} />
        </Tile>
      </div>

      <SectionHeading>Revenue and customers</SectionHeading>
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <Tile label="Revenue this month">
          <Num>{fmtL(latest.revenue_total)}</Num>
          <Meta>
            Net of partner shares
            {revenueChange !== null && prev && (
              <>
                {" · "}
                <span style={{ color: revenueChange >= 0 ? "var(--status-accepted)" : "#8c1a1a", fontWeight: 600 }}>
                  {revenueChange >= 0 ? "▲" : "▼"} {((Math.abs(revenueChange) / (prev.revenue_total || 1)) * 100).toFixed(0)}%
                </span>{" "}
                on {formatPeriodLabel(prev.period).split(" ")[0]}
              </>
            )}
          </Meta>
        </Tile>
        <Tile label="Where the revenue came from" wide>
          {revenueParts.length > 0 ? (
            <>
              <div className="my-2.5 flex overflow-hidden" style={{ height: 26, borderRadius: 5, gap: 2 }}>
                {revenueParts.map((p) => (
                  <div key={p.key} style={{ width: `${((p.value ?? 0) / revenueTotal) * 100}%`, background: MIX_COLORS[p.key] }} />
                ))}
              </div>
              <div className="flex flex-wrap gap-3.5 text-[12px]" style={{ color: "var(--ink-secondary)" }}>
                {revenueParts.map((p) => (
                  <span key={p.key}>
                    <span className="mr-1.5 inline-block" style={{ width: 9, height: 9, borderRadius: 2, background: MIX_COLORS[p.key], verticalAlign: -1 }} />
                    {p.label} <b style={{ color: "var(--ink)", fontWeight: 600 }}>{fmtL(p.value)}</b>
                  </span>
                ))}
              </div>
              {subscriptionPct !== null && (
                <p className="mt-2.5 border-t pt-2.5 text-[11px]" style={{ borderColor: "var(--rule)", color: "var(--ink-secondary)" }}>
                  Recurring subscription is {subscriptionPct.toFixed(0)}% of revenue this month
                  {subscriptionPctPrev !== null ? `, ${subscriptionPct >= subscriptionPctPrev ? "up" : "down"} from ${subscriptionPctPrev.toFixed(0)}% last month.` : "."}
                </p>
              )}
            </>
          ) : (
            <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>—</p>
          )}
        </Tile>
        <Tile label="Client concentration">
          {conc.topPct !== null ? (
            <>
              <Num>{conc.topPct.toFixed(0)}%</Num>
              <Meta>
                One client is {conc.topPct.toFixed(0)}% of revenue.{conc.top5Pct !== null ? ` Top five are ${conc.top5Pct.toFixed(0)}%.` : ""}
              </Meta>
            </>
          ) : (
            <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>—</p>
          )}
        </Tile>
      </div>

      <SectionHeading>Working capital</SectionHeading>
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <Tile label={`Owed to you — ${fmtL(latest.receivables_total)}`} wide>
          <div className="my-2.5 flex overflow-hidden" style={{ height: 22, borderRadius: 4, gap: 2 }}>
            {ageBuckets.map((b, i) => (
              <div key={b.label} style={{ width: `${((b.value ?? 0) / receivablesTotal) * 100}%`, background: AGE_COLORS[i] }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-3.5 text-[12px]" style={{ color: "var(--ink-secondary)" }}>
            {ageBuckets.map((b, i) => (
              <span key={b.label}>
                <span className="mr-1.5 inline-block" style={{ width: 9, height: 9, borderRadius: 2, background: AGE_COLORS[i], verticalAlign: -1 }} />
                {b.label} <b style={{ color: "var(--ink)", fontWeight: 600 }}>{fmtL(b.value)}</b>
              </span>
            ))}
          </div>
          {latest.receivables_90_plus ? (
            <p className="mt-2.5 border-t pt-2.5 text-[11px]" style={{ borderColor: "var(--rule)", color: "var(--ink-secondary)" }}>
              {fmtL(latest.receivables_90_plus)} has been outstanding more than 90 days.
            </p>
          ) : null}
        </Tile>
        <Tile label="You owe">
          <Num>{fmtL(latest.payables_total)}</Num>
          <Meta>Trade creditors at month end</Meta>
        </Tile>
        <Tile label="Collection efficiency">
          <Num red={collEff !== null && collEff < 80}>{collEff !== null ? `${collEff.toFixed(0)}%` : "—"}</Num>
          <Meta>
            {fmtL(latest.collections_month)} collected against {fmtL(latest.billed_month)} billed
            {collDays !== null ? ` · ${collDays.toFixed(0)} days to collect` : ""}
          </Meta>
        </Tile>
      </div>

      <SectionHeading>Compliance</SectionHeading>
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3">
        <Tile label="Statutory filings">
          <p className="text-[16px] font-bold" style={{ color: isOverdue ? "#8c1a1a" : "var(--ink)" }}>{isOverdue ? "Behind" : "Up to date"}</p>
          <Meta>{isOverdue ? "One or more filings are past due" : "Nothing overdue right now"}</Meta>
        </Tile>
        <Tile label="Due in the next 30 days">
          <Num>{dueNext30.length}</Num>
          {dueNext30.length > 0 && <Meta>{dueNext30.slice(0, 3).map((o) => o.name).join(", ")}</Meta>}
        </Tile>
        <Tile label="Open notices">
          <p className="text-[16px] font-bold" style={{ color: openNoticeCount > 0 ? "#8c1a1a" : "var(--ink)" }}>{openNoticeCount === 0 ? "None" : openNoticeCount}</p>
          <Meta>{openNoticeCount === 0 ? "Nothing outstanding from any department" : "Needs your attention"}</Meta>
        </Tile>
      </div>
    </>
  );
}
