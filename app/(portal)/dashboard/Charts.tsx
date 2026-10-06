"use client";

import { useState } from "react";
import { runwayMonths, concentration, collectionDays, collectionEfficiency } from "@/lib/dashboardCalc";
import type { MonthlyFinancials } from "@/lib/types";

const C = { brand: "#1e4620", s1: "#3f6b3f", s2: "#6b8f5a", s3: "#b8a25a", amber: "#8a6412", good: "#1e7a3c", bad: "#a0301f", grid: "#ece6d7", muted: "#8b8779" };

function L(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const a = Math.abs(v), s = v < 0 ? "-" : "";
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(1)}L`;
  return `${s}₹${a.toLocaleString("en-IN")}`;
}
const pct = (v: number) => `${Math.round(v * 100)}%`;
function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const mLabel = (p: string) => MON[Number(p.slice(5, 7)) - 1];
const mFull = (p: string) => `${MON[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;

type Tip = { x: number; y: number; a: string; b: string } | null;

// One tooltip for the whole dashboard: any element with data-tt="title|detail" shows its exact figure on hover.
function Tooltips({ children }: { children: React.ReactNode }) {
  const [tip, setTip] = useState<Tip>(null);
  return (
    <div
      style={{ position: "relative" }}
      onMouseMove={(e) => {
        const el = (e.target as Element).closest("[data-tt]");
        if (!el) return setTip(null);
        const [a, b] = (el.getAttribute("data-tt") ?? "").split("|");
        const box = e.currentTarget.getBoundingClientRect();
        setTip({ x: e.clientX - box.left, y: e.clientY - box.top, a, b });
      }}
      onMouseLeave={() => setTip(null)}
    >
      {children}
      {tip && (
        <div style={{ position: "absolute", left: tip.x + 12, top: tip.y + 12, background: "#1d1b16", color: "#fff", fontSize: 12, padding: "6px 9px", borderRadius: 6, pointerEvents: "none", zIndex: 20, whiteSpace: "nowrap" }}>
          <b>{tip.a}</b>
          <br />
          {tip.b}
        </div>
      )}
    </div>
  );
}

function Info({ text }: { text: string }) {
  return <span className="tip-i" tabIndex={0} data-tip={text}>i</span>;
}

function Panel({ title, sub, right, children }: { title: React.ReactNode; sub?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 10, padding: "15px 16px 16px" }}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="text-[13.5px] font-bold">{title}</div>
          {sub && <div className="text-[11.5px]" style={{ color: "var(--ink-secondary)" }}>{sub}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-3.5 text-[12px]" style={{ color: "var(--ink-secondary)" }}>
      {items.map(([n, c]) => (
        <span key={n}><i className="mr-1.5 inline-block" style={{ width: 9, height: 9, borderRadius: 2, background: c, verticalAlign: -1 }} />{n}</span>
      ))}
    </div>
  );
}

function Axis({ max, y, W, pl, pr }: { max: number; y: (v: number) => number; W: number; pl: number; pr: number }) {
  return (
    <>
      {[0, max / 2, max].map((t) => (
        <g key={t}>
          <line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} stroke={C.grid} />
          <text x={pl - 8} y={y(t) + 4} textAnchor="end" fontSize={10.5} fill={C.muted}>{L(t)}</text>
        </g>
      ))}
    </>
  );
}

function LineChart({ vals, labels, periods, color = C.brand, fmt = L, area = true, h = 170, W = 560 }: { vals: number[]; labels: string[]; periods: string[]; color?: string; fmt?: (v: number) => string; area?: boolean; h?: number; W?: number }) {
  const pl = 44, pr = 14, pt = 14, pb = 26, n = vals.length;
  const max = niceMax(Math.max(...vals, 0) * 1.08);
  const x = (i: number) => pl + (W - pl - pr) * (n === 1 ? 0.5 : i / (n - 1));
  const y = (v: number) => pt + (h - pt - pb) * (1 - v / max);
  const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const step = (W - pl - pr) / Math.max(n - 1, 1);
  return (
    <svg viewBox={`0 0 ${W} ${h}`} style={{ width: "100%", height: "auto" }} role="img">
      {[0, max / 2, max].map((t) => (
        <g key={t}><line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} stroke={C.grid} /><text x={pl - 8} y={y(t) + 4} textAnchor="end" fontSize={10.5} fill={C.muted}>{fmt(t)}</text></g>
      ))}
      {area && <polygon points={`${x(0)},${y(0)} ${pts} ${x(n - 1)},${y(0)}`} fill={color} opacity={0.08} />}
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {vals.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={i === n - 1 ? 5 : 3.5} fill={i === n - 1 ? color : "#fffdf8"} stroke={color} strokeWidth={2} />)}
      <text x={x(n - 1) - 8} y={y(vals[n - 1]) - 11} textAnchor="end" fontSize={11.5} fontWeight={700} fill="var(--ink)">{fmt(vals[n - 1])}</text>
      {labels.map((l, i) => <text key={i} x={x(i)} y={h - 8} textAnchor="middle" fontSize={10.5} fill={C.muted}>{l}</text>)}
      {vals.map((v, i) => <rect key={i} x={x(i) - step / 2} y={pt} width={step} height={h - pt - pb} fill="transparent" data-tt={`${mFull(periods[i])}|${fmt(v)}`} />)}
    </svg>
  );
}

function StackedBars({ series, labels, periods }: { series: { n: string; c: string; v: number[] }[]; labels: string[]; periods: string[] }) {
  const W = 560, h = 190, pl = 44, pr = 14, pt = 14, pb = 26, n = labels.length;
  const tot = labels.map((_, i) => series.reduce((a, s) => a + s.v[i], 0));
  const max = niceMax(Math.max(...tot, 0) * 1.1);
  const y = (v: number) => pt + (h - pt - pb) * (1 - v / max);
  const band = (W - pl - pr) / n, bw = Math.min(46, band * 0.5);
  return (
    <svg viewBox={`0 0 ${W} ${h}`} style={{ width: "100%", height: "auto" }} role="img">
      <Axis max={max} y={y} W={W} pl={pl} pr={pr} />
      {labels.map((l, i) => {
        const cx = pl + band * i + band / 2;
        let acc = 0;
        return (
          <g key={i}>
            {series.map((s) => {
              const v = s.v[i], y0 = y(acc), y1 = y(acc + v);
              acc += v;
              return <rect key={s.n} x={cx - bw / 2} y={y1} width={bw} height={Math.max(y0 - y1 - 2, v > 0 ? 1 : 0)} fill={s.c} data-tt={`${mFull(periods[i])} · ${s.n}|${L(v)} · ${tot[i] ? pct(v / tot[i]) : "0%"} of revenue`} />;
            })}
            <text x={cx} y={y(tot[i]) - 6} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="var(--ink)">{L(tot[i])}</text>
            <text x={cx} y={h - 8} textAnchor="middle" fontSize={10.5} fill={C.muted}>{l}</text>
          </g>
        );
      })}
    </svg>
  );
}

function GroupedBars({ series, labels, periods }: { series: { n: string; c: string; v: number[] }[]; labels: string[]; periods: string[] }) {
  const W = 400, h = 190, pl = 44, pr = 14, pt = 14, pb = 26, n = labels.length;
  const max = niceMax(Math.max(...series.flatMap((s) => s.v), 0) * 1.1);
  const y = (v: number) => pt + (h - pt - pb) * (1 - v / max);
  const band = (W - pl - pr) / n, bw = Math.min(20, band * 0.28);
  return (
    <svg viewBox={`0 0 ${W} ${h}`} style={{ width: "100%", height: "auto" }} role="img">
      <Axis max={max} y={y} W={W} pl={pl} pr={pr} />
      {labels.map((l, i) => {
        const cx = pl + band * i + band / 2;
        return (
          <g key={i}>
            {series.map((s, k) => {
              const x0 = cx + (k - series.length / 2) * (bw + 2) + 1, v = s.v[i];
              return <rect key={s.n} x={x0} y={y(v)} width={bw} height={Math.max(y(0) - y(v), 0)} rx={3} fill={s.c} data-tt={`${mFull(periods[i])} · ${s.n}|${L(v)}`} />;
            })}
            <text x={cx} y={h - 8} textAnchor="middle" fontSize={10.5} fill={C.muted}>{l}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Spark({ vals, periods, fmt }: { vals: number[]; periods: string[]; fmt: (v: number) => string }) {
  const W = 96, H = 28, n = vals.length, mx = Math.max(...vals), mn = Math.min(...vals), rg = mx - mn || 1;
  if (n < 2) return null;
  const pts = vals.map((v, i) => [((W - 4) * i) / (n - 1) + 2, H - 3 - ((H - 6) * (v - mn)) / rg]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: 96, height: 28 }}>
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="#b9b3a3" strokeWidth={1.6} />
      <circle cx={pts[n - 1][0]} cy={pts[n - 1][1]} r={3} fill={C.brand} />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={6} fill="transparent" data-tt={`${mFull(periods[i])}|${fmt(vals[i])}`} />)}
    </svg>
  );
}

function Delta({ cur, prev, upIsGood, fmt, prevLabel }: { cur: number; prev: number; upIsGood: boolean; fmt: (v: number) => string; prevLabel: string }) {
  const d = cur - prev;
  if (Math.abs(d) < 1e-9) return <span className="text-[11.5px]" style={{ color: "var(--ink-secondary)" }}>No change vs {prevLabel}</span>;
  const good = d > 0 === upIsGood;
  return <span className="text-[11.5px] font-semibold" style={{ color: good ? C.good : C.bad }}>{d > 0 ? "▲" : "▼"} {fmt(Math.abs(d))} vs {prevLabel}</span>;
}

function Tile({ label, tip, value, delta, spark }: { label: string; tip: string; value: string; delta: React.ReactNode; spark: React.ReactNode }) {
  return (
    <div style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 10, padding: "15px 16px 16px" }}>
      <p className="mb-1.5 text-[12.5px]" style={{ color: "var(--ink-secondary)" }}>{label} <Info text={tip} /></p>
      <p className="tnum" style={{ fontSize: 26, fontWeight: 650, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{value}</p>
      <div className="mt-1.5 flex items-center justify-between gap-2">{delta}{spark}</div>
    </div>
  );
}

export default function Charts({ history }: { history: MonthlyFinancials[] }) {
  const latest = history[history.length - 1];
  const prev = history[history.length - 2] ?? null;
  if (!latest) return null;
  const periods = history.map((m) => m.period);
  const labels = periods.map(mLabel);
  const num = (f: (m: MonthlyFinancials) => number | null) => history.map((m) => f(m) ?? 0);
  const { months: runway } = runwayMonths(history);
  const avgBurn = (() => {
    const b = history.slice(-3).map((m) => m.net_burn).filter((v): v is number => v !== null);
    return b.length ? b.reduce((a, c) => a + c, 0) / b.length : null;
  })();
  const usable = (latest.cash_closing ?? 0) - (latest.cash_restricted ?? 0);
  const RW_MAX = 18;
  const rwCol = runway === null ? C.muted : runway < 4 ? C.bad : runway < 6 ? C.amber : C.brand;
  const rev = (m: MonthlyFinancials) => m.revenue_total ?? 0;
  const eff = (m: MonthlyFinancials) => collectionEfficiency(m) ?? 0;
  const conc = concentration(latest);
  const concSeries = history.map((m) => (concentration(m).topPct ?? 0) / 100);
  const ar = latest.receivables_total ?? 0;
  const age = [
    { n: "0–30 days", v: latest.receivables_0_30 ?? 0, c: "#c9d6c0" },
    { n: "31–60 days", v: latest.receivables_31_60 ?? 0, c: "#9bb38e" },
    { n: "61–90 days", v: latest.receivables_61_90 ?? 0, c: "#3f6b3f" },
    { n: "Over 90 days", v: latest.receivables_90_plus ?? 0, c: "#1e4620" },
  ];
  const pm = prev ? mLabel(prev.period) : "";
  const collDays = collectionDays(latest);
  const subPct = rev(latest) ? (latest.revenue_subscription ?? 0) / rev(latest) : null;
  const subPrev = prev && rev(prev) ? (prev.revenue_subscription ?? 0) / rev(prev) : null;

  return (
    <Tooltips>
      <p className="mb-3 text-[12px]" style={{ color: "var(--ink-secondary)" }}>Hover any chart for the exact figure.</p>
      <div className="grid gap-3.5 md:grid-cols-2">
        <div style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 10, padding: "15px 16px 16px" }}>
          <p className="text-[12.5px]" style={{ color: "var(--ink-secondary)" }}>Runway <Info text="How many months your freely usable cash lasts at the average net burn of the last three months. We email you and us the day this drops below four months." /></p>
          {runway === null ? (
            <p className="my-2 text-[14px]" style={{ color: "var(--ink-secondary)" }}>Needs three published months</p>
          ) : (
            <>
              <p className="tnum" style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.03em", color: rwCol, lineHeight: 1.1 }}>{runway.toFixed(1)}<span style={{ fontSize: 16, fontWeight: 500, color: "var(--ink-secondary)" }}> months</span></p>
              <div className="relative mt-3" style={{ height: 14, background: "#ece6d7", borderRadius: 7 }} data-tt={`Runway|${runway.toFixed(1)} months`}>
                <div style={{ width: `${Math.min(runway / RW_MAX, 1) * 100}%`, height: "100%", background: rwCol, borderRadius: 7 }} />
                <div style={{ position: "absolute", left: `${(4 / RW_MAX) * 100}%`, top: -4, bottom: -4, borderLeft: `2px solid ${C.bad}` }}>
                  <span style={{ position: "absolute", top: 20, left: 4, fontSize: 10.5, color: C.bad, whiteSpace: "nowrap" }}>4-month alert line</span>
                </div>
              </div>
              <div className="mt-6 flex justify-between text-[10.5px]" style={{ color: C.muted }}><span>0</span><span>6</span><span>12</span><span>18 months</span></div>
              {avgBurn !== null && <p className="mt-2 text-[12px]" style={{ color: "var(--ink-secondary)" }}>{L(usable)} usable cash ÷ {L(avgBurn)} average monthly net burn</p>}
            </>
          )}
        </div>
        <Panel title="Cash in bank" sub="Month-end balance across all accounts" right={<div className="text-right"><div className="tnum text-[20px] font-bold">{L(latest.cash_closing)}</div>{latest.cash_restricted ? <div className="text-[11px]" style={{ color: "var(--ink-secondary)" }}>{L(latest.cash_restricted)} not freely available</div> : null}</div>}>
          <LineChart vals={num((m) => m.cash_closing)} labels={labels} periods={periods} />
        </Panel>
      </div>

      <div className="mt-3.5 grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <Tile label="Net burn" tip="Money that went out this month, less money that came in." value={L(latest.net_burn)}
          delta={prev && <Delta cur={latest.net_burn ?? 0} prev={prev.net_burn ?? 0} upIsGood={false} fmt={L} prevLabel={pm} />}
          spark={<Spark vals={num((m) => m.net_burn)} periods={periods} fmt={L} />} />
        <Tile label="Revenue" tip="Recognised revenue for the month, excluding GST, after partner shares." value={L(latest.revenue_total)}
          delta={prev && <Delta cur={rev(latest)} prev={rev(prev)} upIsGood fmt={L} prevLabel={pm} />}
          spark={<Spark vals={history.map(rev)} periods={periods} fmt={L} />} />
        <Tile label="Paying clients" tip="Clients who paid you something this month." value={String(latest.clients_active ?? "—")}
          delta={prev && <Delta cur={latest.clients_active ?? 0} prev={prev.clients_active ?? 0} upIsGood fmt={(v) => String(v)} prevLabel={pm} />}
          spark={<Spark vals={num((m) => m.clients_active)} periods={periods} fmt={(v) => String(v)} />} />
        <Tile label="Collection efficiency" tip="What you collected this month as a share of what you billed. Below 80% two months running, we flag it."
          value={latest.billed_month ? pct(eff(latest) / 100) : "—"}
          delta={prev && <Delta cur={eff(latest)} prev={eff(prev)} upIsGood fmt={(v) => `${Math.round(v)} pts`} prevLabel={pm} />}
          spark={<Spark vals={history.map((m) => eff(m))} periods={periods} fmt={(v) => `${Math.round(v)}%`} />} />
      </div>

      <div className="mt-3.5 grid gap-3.5 md:grid-cols-2">
        <Panel title="Where revenue came from" sub={`Net of partner shares, last ${history.length} months`}>
          <StackedBars labels={labels} periods={periods} series={[
            { n: "Subscription", c: C.s1, v: num((m) => m.revenue_subscription) },
            { n: "Service", c: C.s2, v: num((m) => m.revenue_service) },
            { n: "Project", c: C.s3, v: num((m) => m.revenue_project) },
          ]} />
          <Legend items={[["Subscription", C.s1], ["Service", C.s2], ["Project", C.s3]]} />
          {subPct !== null && <p className="mt-2 border-t pt-2 text-[11.5px]" style={{ borderColor: "var(--rule)", color: "var(--ink-secondary)" }}>Recurring subscription is <b>{pct(subPct)}</b> of revenue this month{subPrev !== null ? `, ${subPct >= subPrev ? "up" : "down"} from ${pct(subPrev)}` : ""}.</p>}
        </Panel>
        <Panel title={<>Client concentration <Info text="How much of this month's revenue depends on your biggest clients. Above 40% from one client is worth a conversation." /></>} sub={`Share of ${mFull(latest.period).split(" ")[0]} revenue`}>
          {conc.topPct === null ? <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>—</p> : (
            <>
              {[{ n: "Largest client", v: conc.topPct / 100, col: conc.topPct >= 40 ? C.amber : C.brand, mark: true }, { n: "Top five clients", v: (conc.top5Pct ?? 0) / 100, col: C.brand, mark: false }].map((b) => (
                <div key={b.n} className="mb-2.5">
                  <div className="mb-1 flex justify-between text-[12.5px]"><span>{b.n}</span><b>{pct(b.v)}</b></div>
                  <div className="relative" style={{ height: 12, background: "#ece6d7", borderRadius: 6 }} data-tt={`${b.n}|${pct(b.v)} of revenue`}>
                    <div style={{ width: `${Math.min(b.v, 1) * 100}%`, height: "100%", background: b.col, borderRadius: 6 }} />
                    {b.mark && <div style={{ position: "absolute", left: "40%", top: -3, bottom: -3, borderLeft: `2px dashed ${C.bad}` }} />}
                  </div>
                </div>
              ))}
              <p className="mb-1 mt-3 text-[11.5px]" style={{ color: "var(--ink-secondary)" }}>Largest client&apos;s share, by month <span style={{ color: C.bad }}>(dashed line = 40%)</span></p>
              <LineChart vals={concSeries} labels={labels} periods={periods} color={C.amber} fmt={pct} area={false} h={120} W={300} />
              {conc.topPct >= 40 && <p className="mt-1 text-[11.5px]" style={{ color: C.amber }}>One client is {Math.round(conc.topPct)}% of revenue this month.</p>}
            </>
          )}
        </Panel>
      </div>

      <div className="mt-3.5 grid gap-3.5 md:grid-cols-2">
        <Panel title="Billed and collected" sub="Each month, what you invoiced against what came in">
          <GroupedBars labels={labels} periods={periods} series={[{ n: "Billed", c: "#b9b3a3", v: num((m) => m.billed_month) }, { n: "Collected", c: C.brand, v: num((m) => m.collections_month) }]} />
          <Legend items={[["Billed", "#b9b3a3"], ["Collected", C.brand]]} />
          {collDays !== null && <p className="mt-2 text-[11.5px]" style={{ color: "var(--ink-secondary)" }}>About {collDays.toFixed(0)} days to collect this month.</p>}
        </Panel>
        <Panel title={`Who owes you — ${L(latest.receivables_total)}`} sub="By how long it has been outstanding">
          <div className="mt-3 flex overflow-hidden" style={{ height: 26, borderRadius: 5, gap: 2 }}>
            {age.map((a) => <div key={a.n} style={{ width: `${ar ? (a.v / ar) * 100 : 0}%`, background: a.c }} data-tt={`${a.n}|${L(a.v)}${ar ? ` · ${pct(a.v / ar)} of what you are owed` : ""}`} />)}
          </div>
          <Legend items={age.map((a) => [`${a.n} ${L(a.v)}`, a.c] as [string, string])} />
          {(latest.receivables_90_plus ?? 0) > 0 && <p className="mt-2 border-t pt-2 text-[11.5px]" style={{ borderColor: "var(--rule)", color: "var(--ink-secondary)" }}>{L(latest.receivables_90_plus)} has been outstanding more than 90 days.</p>}
          <p className="mt-2 text-[12px]" style={{ color: "var(--ink-secondary)" }}>You owe {L(latest.payables_total)} to trade creditors at month end.</p>
        </Panel>
      </div>
    </Tooltips>
  );
}
