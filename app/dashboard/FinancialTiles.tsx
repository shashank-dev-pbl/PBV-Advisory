import { formatPeriodLabel, currentPeriod } from "@/lib/period";
import { formatINR } from "@/lib/currency";
import {
  runwayMonths,
  averageMonthlyExpenses,
  changeVsLastMonth,
  revenueMix,
  concentration,
  collectionDays,
  collectionEfficiency,
  collectionEfficiencyAlert,
} from "@/lib/dashboardCalc";
import type { MonthlyFinancials } from "@/lib/types";

function Tile({ label, children, tone }: { label: string; children: React.ReactNode; tone?: "red" }) {
  return (
    <div className="p-4" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)" }}>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: "var(--ink-secondary)" }}>{label}</p>
      <div style={{ color: tone === "red" ? "#8c1a1a" : "var(--ink)" }}>{children}</div>
    </div>
  );
}

function ChangeNote({ value }: { value: number | null }) {
  if (value === null) return null;
  const up = value > 0;
  return (
    <p className="mt-1 text-[11px]" style={{ color: "var(--ink-secondary)" }}>
      {up ? "+" : ""}{formatINR(value)} vs last month
    </p>
  );
}

function Sparkbar({ values }: { values: (number | null)[] }) {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  const max = Math.max(...present.map((v) => Math.abs(v)), 1);
  return (
    <div className="mt-2 flex items-end gap-1" style={{ height: 32 }}>
      {values.map((v, i) => (
        <div
          key={i}
          title={v !== null ? formatINR(v) : ""}
          style={{
            flex: 1,
            height: v !== null ? `${Math.max(6, (Math.abs(v) / max) * 32)}px` : 2,
            background: v !== null ? "var(--bottomline-green)" : "var(--rule)",
            opacity: v !== null ? 0.75 : 0.4,
          }}
        />
      ))}
    </div>
  );
}

export default function FinancialTiles({
  history,
  isPractitioner,
}: {
  history: MonthlyFinancials[]; // published rows only, oldest first, up to 6 months
  isPractitioner: boolean;
}) {
  const published = history.filter((m) => m.status === "published");
  const latest = published[published.length - 1] ?? null;

  if (!latest) {
    const [y, m] = currentPeriod().split("-").map(Number);
    const dueDate = new Date(y, m, 10); // 10th of next month
    return (
      <div className="p-6 text-center" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)" }}>
        <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>
          Your first set of numbers will appear here once we complete the {formatPeriodLabel(currentPeriod())} close — by{" "}
          {dueDate.toLocaleDateString("en-US", { day: "numeric", month: "long" })}.
        </p>
      </div>
    );
  }

  const isLate = latest.period !== currentPeriod();
  const { months: runway, monthsOfHistory } = runwayMonths(published);
  const { value: avgExpenses, count: avgExpensesCount } = averageMonthlyExpenses(published);
  const mix = revenueMix(latest);
  const conc = concentration(latest);
  const collDays = collectionDays(latest);
  const collEff = collectionEfficiency(latest);
  const collEffAlertActive = collectionEfficiencyAlert(published);

  return (
    <div className="flex flex-col gap-8">
      {isLate && (
        <div className="p-3" style={{ background: "rgba(184,134,11,0.08)", border: "1px solid rgba(184,134,11,0.25)" }}>
          <p className="text-[12px] font-semibold" style={{ color: "var(--status-uploaded)" }}>
            {formatPeriodLabel(latest.period)} figures are being prepared. Showing the last published month below.
          </p>
        </div>
      )}

      {runway !== null && runway < 4 && (
        <div className="p-3" style={{ background: "rgba(140,26,26,0.06)", border: "1px solid rgba(140,26,26,0.2)" }}>
          <p className="text-[12px] font-semibold" style={{ color: "#8c1a1a" }}>Runway is below 4 months.</p>
        </div>
      )}

      {isPractitioner && collEffAlertActive && (
        <div className="p-3" style={{ background: "rgba(140,26,26,0.06)", border: "1px solid rgba(140,26,26,0.2)" }}>
          <p className="text-[12px] font-semibold" style={{ color: "#8c1a1a" }}>Collection efficiency has been below 80% for two consecutive months.</p>
        </div>
      )}

      <section>
        <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--ink)" }}>Cash and survival</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Tile label="Cash in bank">
            <p className="text-[20px] font-extrabold tnum">{formatINR(latest.cash_closing)}</p>
            {latest.cash_restricted ? (
              <p className="mt-1 text-[11px]" style={{ color: "var(--ink-secondary)" }}>{formatINR(latest.cash_restricted)} not freely available</p>
            ) : null}
          </Tile>
          <Tile label="Runway" tone={runway !== null && runway < 4 ? "red" : undefined}>
            {runway === null ? (
              <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>— (available from month 3, have {monthsOfHistory})</p>
            ) : (
              <p className="text-[20px] font-extrabold tnum">{runway.toFixed(1)} months</p>
            )}
          </Tile>
          <Tile label="Net burn this month">
            <p className="text-[20px] font-extrabold tnum">{formatINR(latest.net_burn)}</p>
            <ChangeNote value={changeVsLastMonth(published, "net_burn")} />
          </Tile>
          <Tile label="Gross burn this month">
            <p className="text-[20px] font-extrabold tnum">{formatINR(latest.gross_burn)}</p>
          </Tile>
          <Tile label="Average monthly expenses">
            <p className="text-[20px] font-extrabold tnum">{formatINR(avgExpenses)}</p>
            <p className="mt-1 text-[11px]" style={{ color: "var(--ink-secondary)" }}>average of {avgExpensesCount} month{avgExpensesCount === 1 ? "" : "s"}</p>
          </Tile>
          <Tile label="Cash trend">
            <Sparkbar values={history.map((m) => m.cash_closing)} />
          </Tile>
        </div>
      </section>

      <section>
        <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--ink)" }}>Revenue and customers</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Tile label="Revenue this month">
            <p className="text-[20px] font-extrabold tnum">{formatINR(latest.revenue_total)}</p>
            <ChangeNote value={changeVsLastMonth(published, "revenue_total")} />
          </Tile>
          <Tile label="Revenue trend">
            <Sparkbar values={history.map((m) => m.revenue_total)} />
          </Tile>
          <Tile label="Revenue mix">
            {mix ? (
              <div className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--ink-secondary)" }}>
                <p>Subscription {mix.subscription.toFixed(0)}%</p>
                <p>Service {mix.service.toFixed(0)}%</p>
                <p>Project {mix.project.toFixed(0)}%</p>
              </div>
            ) : (
              <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>—</p>
            )}
          </Tile>
          <Tile label="Partner share">
            <p className="text-[16px] font-bold tnum">{formatINR(latest.partner_share_paid)}</p>
            <p className="mt-1 text-[11px]" style={{ color: "var(--ink-secondary)" }}>
              gross {formatINR((latest.revenue_total ?? 0) + (latest.partner_share_paid ?? 0))}
            </p>
          </Tile>
          <Tile label="Clients">
            <p className="text-[20px] font-extrabold tnum">{latest.clients_active ?? "—"}</p>
            <p className="mt-1 text-[11px]" style={{ color: "var(--ink-secondary)" }}>
              +{latest.clients_added ?? 0} / -{latest.clients_lost ?? 0} this month
            </p>
          </Tile>
          <Tile label="Concentration">
            {conc.topPct !== null ? (
              <>
                <p className="text-[16px] font-bold tnum">{conc.topPct.toFixed(0)}%</p>
                {conc.topPct > 40 && (
                  <p className="mt-1 text-[11px]" style={{ color: "#8c1a1a" }}>one client is {conc.topPct.toFixed(0)}% of revenue</p>
                )}
                {conc.top5Pct !== null && (
                  <p className="mt-1 text-[11px]" style={{ color: "var(--ink-secondary)" }}>top 5: {conc.top5Pct.toFixed(0)}%</p>
                )}
              </>
            ) : (
              <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>—</p>
            )}
          </Tile>
        </div>
      </section>

      <section>
        <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--ink)" }}>Working capital</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Tile label="Owed to you">
            <p className="text-[20px] font-extrabold tnum">{formatINR(latest.receivables_total)}</p>
            <div className="mt-2 flex h-2 w-full overflow-hidden" style={{ background: "var(--rule)" }}>
              {[latest.receivables_0_30, latest.receivables_31_60, latest.receivables_61_90, latest.receivables_90_plus].map((v, i) => {
                const total = latest.receivables_total || 1;
                const pct = ((v ?? 0) / total) * 100;
                const colors = ["var(--bottomline-green)", "var(--status-uploaded)", "#c47a1f", "#8c1a1a"];
                return <div key={i} style={{ width: `${pct}%`, background: colors[i] }} />;
              })}
            </div>
          </Tile>
          <Tile label="Over 90 days" tone={latest.receivables_90_plus ? undefined : undefined}>
            <p className="text-[20px] font-extrabold tnum">{formatINR(latest.receivables_90_plus)}</p>
          </Tile>
          <Tile label="You owe">
            <p className="text-[20px] font-extrabold tnum">{formatINR(latest.payables_total)}</p>
          </Tile>
          <Tile label="Collection days">
            <p className="text-[20px] font-extrabold tnum">{collDays !== null ? collDays.toFixed(0) : "—"}</p>
          </Tile>
          <Tile label="Collection efficiency" tone={collEff !== null && collEff < 80 ? "red" : undefined}>
            <p className="text-[20px] font-extrabold tnum">{collEff !== null ? `${collEff.toFixed(0)}%` : "—"}</p>
          </Tile>
        </div>
      </section>

      <section>
        <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--ink)" }}>Compliance</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Tile label="Filings" tone={latest.filings_current === false ? "red" : undefined}>
            <p className="text-[16px] font-bold">{latest.filings_current === null ? "—" : latest.filings_current ? "Up to date" : "Behind"}</p>
          </Tile>
          <Tile label="Due in 30 days">
            <p className="text-[20px] font-extrabold tnum">{latest.filings_due_30d ?? 0}</p>
            {latest.filings_due_note && (
              <p className="mt-1 text-[11px]" style={{ color: "var(--ink-secondary)" }}>{latest.filings_due_note}</p>
            )}
          </Tile>
          <Tile label="Open notices">
            <p className="text-[16px] font-bold">{latest.notices_open ? latest.notices_open : "None"}</p>
          </Tile>
        </div>
      </section>

      <p className="text-[11px]" style={{ color: "var(--ink-secondary)" }}>
        {formatPeriodLabel(latest.period)}{latest.published_at ? ` · published ${new Date(latest.published_at).toLocaleDateString()}` : ""}
      </p>
    </div>
  );
}
