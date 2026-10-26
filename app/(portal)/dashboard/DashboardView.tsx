"use client";

import "../proto.css";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { L, aggregate, bucketsFor, dDelta, delta, fyLabel, niceTicks, pct, periodName, periodOf, periodsAvailable, prevKey, ymAdd, ymLabel, type Agg, type Bucket, type Delta, type Fig, type View } from "@/lib/dashboard/model";

export type AttItem = { lv: "red" | "amber" | "grey"; title: string; detail?: string; act?: { label: string; href: string } };   // **bold** markers in title and detail
export type FilingStat = { total: number; done: number };
export type FilingLine = { ym: string; name: string; due: string; done: boolean };
export type Snapshot = { rounds: string[]; debs: string[]; loans: string[]; holds: string[] };

const C4 = ["#2a78d6", "#eb6834", "#1baf7a"];
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const bold = (s: string) => s.split("**").map((t, i) => (i % 2 ? <b key={i}>{t}</b> : <span key={i}>{t}</span>));
const dshort = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/* ---------- charts ---------- */
function roundTop(x: number, y: number, w: number, h: number) { const r = Math.min(4, h); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; }
function StackBars({ B, series, h = 200 }: { B: Bucket[]; series: [keyof Agg, string][]; h?: number }) {
  const W = 640, H = h, pl = 44, pb = 34, pt = 10, n = B.length, step = (W - pl - 10) / n, bw = Math.min(34, step * 0.62);
  const tot = (b: Bucket) => (b.a ? series.reduce((s, [k]) => s + ((b.a![k] as number | null) ?? 0), 0) : 0);
  const max = Math.max(...B.map(tot)) * 1.12 || 1, ticks = niceTicks(max), top = ticks[ticks.length - 1], y = (v: number) => pt + (H - pt - pb) * (1 - v / top);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img">
      {ticks.map((t) => <g key={t}><line x1={pl} x2={W - 6} y1={y(t)} y2={y(t)} className="gl" /><text x={pl - 6} y={y(t) + 4} className="ax" textAnchor="end">{L(t).replace("₹", "")}</text></g>)}
      {B.map((b, i) => {
        const x = pl + step * i + (step - bw) / 2, lab = b.lab.split("\n");
        const axis = <g key={`a${i}`}><text x={x + bw / 2} y={H - pb + 15} className={`ax ${b.cur ? "cur" : ""}`} textAnchor="middle">{lab[0]}</text>{lab[1] && <text x={x + bw / 2} y={H - pb + 27} className="ax" textAnchor="middle">{lab[1]}</text>}</g>;
        if (!b.a) return <g key={i}>{axis}<rect x={x} y={y(0) - 3} width={bw} height={3} rx={1.5} className="ghost" /></g>;
        let acc = 0; const t = tot(b);
        const tip = `<b>${esc(b.lab.replace("\n", " "))}</b>${series.map(([k, l], si) => `<div><i style="background:${C4[si]}"></i>${l}<span>${L(b.a![k] as number | null)}</span></div>`).join("")}<div class="tt-t">Total<span>${L(t)}</span></div>${b.a.partial ? `<div class="tt-n">${b.a.n} of ${b.a.of} months published</div>` : ""}`;
        return (
          <g key={i}>{axis}
            <g opacity={b.a.partial ? 0.45 : 1}>{series.map(([k], si) => {
              const v = (b.a![k] as number | null) ?? 0, y1 = y(acc + v), y0 = y(acc); acc += v;
              return si === series.length - 1 ? <path key={si} d={roundTop(x, y1, bw, y0 - y1)} fill={C4[si]} /> : <rect key={si} x={x} y={y1} width={bw} height={Math.max(0, y0 - y1 - 2)} fill={C4[si]} />;
            })}</g>
            {b.a.partial && <text x={x + bw / 2} y={y(t) - (b.cur ? 20 : 6)} className="ax" textAnchor="middle">{b.a.n} of {b.a.of} mo</text>}
            <rect x={pl + step * i} y={pt} width={step} height={H - pt - pb} fill="transparent" className="hit" data-tt={tip} />
            {b.cur && <text x={x + bw / 2} y={y(t) - 6} className="vl" textAnchor="middle">{L(t)}</text>}
          </g>
        );
      })}
    </svg>
  );
}
function LineChart({ B, lines, h = 190, refLine }: { B: Bucket[]; lines: [keyof Agg, string, string][]; h?: number; refLine?: { v: number; label: string } }) {
  const W = 640, H = h, pl = 44, pb = 34, pt = 12, n = B.length, step = (W - pl - 16) / Math.max(1, n - 1);
  const vals = B.flatMap((b) => (b.a ? lines.map(([k]) => b.a![k] as number) : []));
  const max = Math.max(...vals, 0) * 1.15 || 1, ticks = niceTicks(max), top = ticks[ticks.length - 1], y = (v: number) => pt + (H - pt - pb) * (1 - v / top), X = (i: number) => pl + 8 + step * i;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img">
      {ticks.map((t) => <g key={t}><line x1={pl} x2={W - 6} y1={y(t)} y2={y(t)} className="gl" /><text x={pl - 6} y={y(t) + 4} className="ax" textAnchor="end">{L(t).replace("₹", "")}</text></g>)}
      {refLine && refLine.v > 0 && <g><line x1={pl} x2={W - 6} y1={y(refLine.v)} y2={y(refLine.v)} className="ref" /><text x={W - 8} y={y(refLine.v) - 5} className="ax" textAnchor="end">{refLine.label}</text></g>}
      {B.map((b, i) => { const lab = b.lab.split("\n"); return <g key={`a${i}`}><text x={X(i)} y={H - pb + 15} className={`ax ${b.cur ? "cur" : ""}`} textAnchor="middle">{lab[0]}</text>{lab[1] && <text x={X(i)} y={H - pb + 27} className="ax" textAnchor="middle">{lab[1]}</text>}</g>; })}
      {lines.map(([k, , col]) => {
        let d = "", on = false; B.forEach((b, i) => { if (b.a) { d += `${on ? "L" : "M"}${X(i)},${y(b.a[k] as number)}`; on = true; } else on = false; });
        return <path key={String(k)} d={d} fill="none" stroke={col} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />;
      })}
      {B.map((b, i) => b.a && (
        <g key={i}>
          {lines.map(([k, , col]) => <circle key={String(k)} cx={X(i)} cy={y(b.a![k] as number)} r={b.cur ? 4.5 : 2.6} fill={col} stroke="#fff" strokeWidth={2} />)}
          <rect x={X(i) - step / 2} y={pt} width={step} height={H - pt - pb} fill="transparent" className="hit"
            data-tt={`<b>${esc(b.lab.replace("\n", " "))}</b>${lines.map(([k, l, col]) => `<div><i style="background:${col}"></i>${l}<span>${L(b.a![k] as number)}</span></div>`).join("")}`} />
          {b.cur && <text x={X(i) + (i === n - 1 ? 4 : 0)} y={y(b.a[lines[0][0]] as number) - 10} className="vl" textAnchor={i === n - 1 ? "end" : "middle"}>{L(b.a[lines[0][0]] as number)}</text>}
        </g>
      ))}
    </svg>
  );
}
function Spark({ B, k }: { B: Bucket[]; k: keyof Agg }) {
  const pts = B.filter((b) => b.a).slice(-6); if (pts.length < 2) return null;
  const v = pts.map((b) => b.a![k] as number), mn = Math.min(...v), mx = Math.max(...v) || 1, W = 90, H = 26;
  const d = v.map((x, i) => `${i ? "L" : "M"}${((i * (W - 4)) / (v.length - 1) + 2).toFixed(1)},${(H - 3 - (H - 6) * (mx === mn ? 0.5 : (x - mn) / (mx - mn))).toFixed(1)}`).join("");
  return <svg viewBox={`0 0 ${W} ${H}`} className="spark"><path d={d} fill="none" stroke="#2a78d6" strokeWidth={1.6} /></svg>;
}

/* ---------- pieces ---------- */
function Tip({ t }: { t: string }) { return <span className="ib qtip" tabIndex={0}>i<span className="qt">{t}</span></span>; }
function Tile({ label, val, sub, d, tip, flag, flagNote, children }: { label: string; val: React.ReactNode; sub?: React.ReactNode; d?: Delta; tip?: string; flag?: "red" | "amber" | ""; flagNote?: string; children?: React.ReactNode }) {
  return (
    <div className={`tile ${flag ?? ""}`}><div className="tlab">{label}{tip && <Tip t={tip} />}</div><div className="tv">{val}</div>{sub && <div className="ts">{sub}</div>}
      {d && <span className={`dl ${d.na ? "na" : ""}`}>{d.text}</span>}{children}{flagNote && <div className="fnote">{flagNote}</div>}</div>
  );
}
function Expander({ title, open, children }: { title: React.ReactNode; open?: boolean; children: React.ReactNode }) {
  const [o, setO] = useState(!!open);
  return <div className={`xp ${o ? "o" : ""}`}><button className="xph" onClick={() => setO(!o)}><span className="chev">›</span>{title}</button>{o && <div className="xpb">{children}</div>}</div>;
}
const Legend = ({ items }: { items: [string, string][] }) => <div className="lgd">{items.map(([l, c]) => <span key={l}><i style={{ background: c }} />{l}</span>)}</div>;
function TableOf({ B, cols }: { B: Bucket[]; cols: [keyof Agg, string, ((v: number) => string)?][] }) {
  return (
    <div className="tw"><table className="dt"><thead><tr><th />{cols.map((c) => <th key={String(c[0])}>{c[1]}</th>)}</tr></thead>
      <tbody>{B.filter((b) => b.a).map((b) => <tr key={b.k}><td>{b.lab.replace("\n", " ")}</td>{cols.map(([k, , f]) => { const v = b.a![k] as number | null; return <td key={String(k)}>{v == null ? "—" : (f ?? L)(v)}</td>; })}</tr>)}</tbody></table></div>
  );
}
const NA = ({ what }: { what: string }) => <div className="dm" style={{ padding: "8px 0" }}>{what} is not in the MIS workbook yet. It appears here once the template carries it.</div>;

export default function DashboardView({ figs, filings, filingLines, attention, preparing, reopened, isPBA, firmName, snapshot, docs, todayLabel, hasMaster, initial }: {
  figs: Record<string, Fig>; filings: Record<string, FilingStat>; filingLines: FilingLine[]; attention: AttItem[]; preparing: string[]; reopened: string[]; isPBA: boolean; firmName: string | null;
  snapshot: Snapshot; docs: { ym: string; items: string[] }[]; todayLabel: string; hasMaster: boolean; initial?: string;
}) {
  const keys0 = periodsAvailable("month", figs);
  const [view, setView] = useState<View>("month");
  const [key, setKey] = useState<string | null>(initial && figs[initial] ? initial : null);
  const [attAll, setAttAll] = useState(false);
  const [tip, setTip] = useState<{ html: string; x: number; y: number } | null>(null);
  const pps = useRef<HTMLDivElement>(null);

  const keys = periodsAvailable(view, figs);
  const k = key && keys.includes(key) ? key : keys[keys.length - 1];
  useEffect(() => { const e = pps.current?.querySelector(".pp.on") as HTMLElement | null; if (e && pps.current) pps.current.scrollLeft = e.offsetLeft - pps.current.offsetLeft - pps.current.clientWidth + e.offsetWidth + 40; }, [k, view]);
  function switchView(v: View) { const cur = k ? aggregate(view, k, figs, filings) : null; const ym = cur ? cur.lastYm : keys0[keys0.length - 1]; setView(v); setKey(periodOf(v, ym)); }

  const a = k ? aggregate(view, k, figs, filings) : null;
  const pk = k ? prevKey(view, k) : "", p = a ? aggregate(view, pk, figs, filings) : null;
  const pl = view === "month" ? ymLabel(pk) : periodName(view, pk, true);
  const B = useMemo(() => (k ? bucketsFor(view, k, figs, filings) : []), [view, k, figs, filings]);
  const onMove = (e: React.MouseEvent) => {
    const t = (e.target as HTMLElement).closest?.("[data-tt]") as HTMLElement | null;
    if (!t) { if (tip) setTip(null); return; }
    setTip({ html: t.getAttribute("data-tt") ?? "", x: e.clientX, y: e.clientY });
  };

  if (!a || !k) {
    return (
      <div className="p5"><div className="content" style={{ padding: "18px 22px" }}>
        <div className="phold"><b>Your numbers will appear here once the first month is published.</b><br />
          {preparing.length ? `${ymLabel(preparing[0], true)} is being prepared, then checked and published by Prime Bottomline.` : hasMaster ? "The months to track come from the company master." : "Start with the company master — the months to track come from it."}
          <div style={{ marginTop: 12 }}>{hasMaster ? <Link className="b solid" href="/monthly">Open monthly close</Link> : <Link className="b solid" href="/company-master">Open the company master</Link>}</div></div>
        {attention.length > 0 && <AttentionBox items={attention} all={attAll} setAll={setAttAll} todayLabel={todayLabel} />}
      </div></div>
    );
  }
  const runwayRed = a.runway != null && a.runway < 4;
  const oneLine = (
    <>Revenue of <b>{L(a.net)}</b>{p && <> ({a.net / a.n >= p.net / p.n ? "up" : "down"} {Math.abs(((a.net / a.n - p.net / p.n) / (p.net / p.n)) * 100).toFixed(0)}%{a.n !== p.n ? " per month" : ""})</>}, expenses of <b>{L(a.exp)}</b>, a {a.pl < 0 ? "loss" : "profit"} of <b>{L(Math.abs(a.pl))}</b>. Cash at the end: <b>{L(a.cash)}</b>, which is <b className={runwayRed ? "red" : ""}>{a.runway ? `${a.runway.toFixed(1)} months` : "—"}</b> of runway. {a.clients} paying clients{a.added || a.lost ? ` (${a.added ? `+${a.added}` : ""}${a.added && a.lost ? ", " : ""}${a.lost ? `−${a.lost}` : ""})` : ""}.</>
  );
  const revSeries: [keyof Agg, string][] = [["sub", "Subscription"], ["svc", "Service"], ["proj", "Project"]];
  const ageing: [keyof Agg, string, string][] = [["r0", "0–30 days", "#86b6ef"], ["r30", "31–60 days", "#3987e5"], ["r60", "61–90 days", "#1c5cab"], ["r90", "Over 90 days", "#0d366b"]];
  const taxS: [keyof Agg, string][] = [["gst", "GST"], ["tds", "TDS"], ["otherTax", "Professional tax"]];
  const heads = a.expBy ? Object.entries(a.expBy).sort((x, y) => y[1] - x[1]) : null;
  const taxKnown = a.gst != null || a.tds != null;
  const periodLines = filingLines.filter((f) => a.months.includes(f.ym));
  const lastFilesShown = view === "month" ? 18 : 8;

  return (
    <div className="p5" onMouseMove={onMove} onMouseLeave={() => setTip(null)}>
      <div className="content" style={{ padding: "18px 22px" }}>
        <div className="dhead">
          <div className="seg">{(["month", "quarter", "year"] as View[]).map((v) => <button key={v} className={view === v ? "on" : ""} onClick={() => switchView(v)}>{({ month: "Month", quarter: "Quarter", year: "Year" })[v]}</button>)}</div>
          <div className="pps" ref={pps}>{keys.slice(-lastFilesShown).map((x) => { const g = aggregate(view, x, figs, filings); return <button key={x} className={`pp ${x === k ? "on" : ""}`} onClick={() => setKey(x)}>{periodName(view, x, true)}{g?.partial ? <sup>·</sup> : null}</button>; })}</div>
        </div>
        <div className="ptitle"><div><h2>{periodName(view, k)}</h2>
          <div className="dm">{a.partial && <><b className="amb">{a.n} of {a.of} months published</b> · </>}Prepared by {firmName ?? "the practitioner"} · checked and published by Prime Bottomline · compared with {pl}{a.months.some((m) => reopened.includes(m)) && <> · <b className="amb">reopened for corrections — showing the last published figures</b></>}</div></div>
          {preparing.length > 0 && <div className="pend">{preparing.map((m) => ymLabel(m, true)).join(", ")} {preparing.length > 1 ? "are" : "is"} being prepared{isPBA ? " — hidden from the founder until published" : ""}</div>}
        </div>

        <AttentionBox items={attention} all={attAll} setAll={setAttAll} todayLabel={todayLabel} />

        <div className="oneline"><span className="tlab">{view === "month" ? "The month" : view === "quarter" ? "The quarter" : "The year"} in one line</span><div>{oneLine}</div></div>

        <div className="hero">
          <Tile label="Cash in bank" val={L(a.cash)} sub={`End of ${ymLabel(a.lastYm, true)} · of which ${L(a.restricted)} is in a fixed deposit`} d={dDelta(a, p, "cash", pl, L)} tip="Total across all bank accounts on the last day of the period. The fixed deposit is counted here but not in runway, because it is not freely usable."><Spark B={B} k="cash" /></Tile>
          <Tile label="Runway" val={a.runway ? <>{a.runway.toFixed(1)} <small>months</small></> : "—"} sub={a.runway ? `Free cash ${L(a.cash - a.restricted)} ÷ ${L(a.avgBurn)} average net burn (last 3 months)` : "Available from month 3"} d={a.runway ? dDelta(a, p, "runway", pl, (v) => `${v.toFixed(1)} mo`) : null} flag={runwayRed ? "red" : ""} flagNote={runwayRed ? "Below 4 months" : ""} tip="How many months the company can keep going at its recent burn, if nothing else changes. Below 4 months, both you and Prime Bottomline get an email." />
          <Tile label="Revenue" val={L(a.net)} sub={`Net of ${L(a.partner)} paid to partners`} d={delta(a, p, "net", pl)} tip="Revenue earned in the period, without GST, after taking out what is owed to revenue-share partners. This is the money that is really yours."><Spark B={B} k="net" /></Tile>
          <Tile label="Net burn" val={L(a.netBurn)} sub={view === "month" ? "Cash out minus cash in" : `${L(a.netBurn / a.n)} a month on average`} d={delta(a, p, "netBurn", pl)} tip="How much the bank balance went down: everything paid out, minus everything received. Runway is built on this." />
        </div>

        <section className="ds"><div className="dsh"><h3>Revenue and customers</h3><span className="gsrc">from the MIS workbook{a.n > 1 ? "s" : ""} · {view === "month" ? "last 12 months" : view === "quarter" ? "by quarter" : `months of ${fyLabel(+k)}`}</span></div>
          <div className="dsg"><div className="cbox"><div className="cth"><b>Revenue by type</b><Legend items={revSeries.map(([, l], i) => [l, C4[i]])} /></div><StackBars B={B} series={revSeries} /></div>
            <div className="tiles2">
              <Tile label="Recurring revenue" val={pct(a.recurring)} sub={`Subscription is ${L(a.sub)} of ${L(a.net)}`} tip="The share of revenue that repeats every month without being sold again. Investors value this the most." />
              <Tile label="Monthly recurring (MRR)" val={L(a.mrr)} sub={`${L(a.arr)} a year at this rate (ARR)`} tip="Subscription revenue in the last month of the period. ARR is the same number times twelve." />
              <Tile label="Paying clients" val={a.clients} sub={`${a.added} added, ${a.lost} lost in the period`} d={dDelta(a, p, "clients", pl, (v) => String(Math.round(v)))} tip="Clients who paid for something in the last month of the period." />
              <Tile label="Largest client" val={pct(a.topShare)} sub={`of revenue · top five are ${pct(a.top5Share)}`} flag={a.topShare > 0.4 ? "amber" : ""} flagNote={a.topShare > 0.4 ? "Above 40%" : ""} tip="How much of revenue comes from the single biggest client. Above 40%, losing one client would hurt badly." />
            </div></div>
          <Expander title="More on revenue"><div className="tiles3">
            <Tile label="Billed to clients" val={L(a.gross)} sub="Before partner share, without GST" d={delta(a, p, "gross", pl)} />
            <Tile label="Paid to partners" val={L(a.partner)} sub={a.gross ? `${pct(a.partner / a.gross)} of what was billed` : ""} d={delta(a, p, "partner", pl)} tip="Revenue-share and commission owed to channel partners on clients they brought in." />
            <Tile label="Revenue per client" val={L(a.perClient)} sub="a month, on average" />
          </div><div className="dm" style={{ margin: "10px 0 6px" }}>The chart as a table</div><TableOf B={B} cols={[["sub", "Subscription"], ["svc", "Service"], ["proj", "Project"], ["net", "Total"], ["partner", "Partner share"]]} /></Expander>
        </section>

        <section className="ds"><div className="dsh"><h3>Cash and spending</h3><span className="gsrc">bank balances are checked against the bank statements</span></div>
          <div className="dsg"><div className="cbox">
            <div className="cth"><b>Cash in bank at month end</b><Legend items={[["Cash at month end", "#2a78d6"]]} /></div>
            <LineChart B={B} lines={[["cash", "Cash at month end", "#2a78d6"]]} h={180} refLine={{ v: a.restricted, label: `fixed deposit ${L(a.restricted)}` }} />
            <div className="cth" style={{ marginTop: 6 }}><b>Revenue and expenses{view === "quarter" ? ", average per month" : ""}</b><Legend items={[["Revenue", "#1baf7a"], ["Expenses", "#eb6834"]]} /></div>
            <LineChart B={view === "quarter" ? B.map((b) => (b.a ? { ...b, a: { ...b.a, net: b.a.net / b.a.n, exp: b.a.exp / b.a.n } } : b)) : B} lines={[["net", "Revenue", "#1baf7a"], ["exp", "Expenses", "#eb6834"]]} h={170} />
          </div>
            <div className="tiles2">
              <Tile label={a.pl < 0 ? "Loss" : "Profit"} val={L(Math.abs(a.pl))} sub={`Revenue ${L(a.net)} − expenses ${L(a.exp)}`} d={delta(a, p, "pl", pl)} tip="Revenue minus expenses, counted when earned and incurred — not when the cash moved. This is what the P&L says." />
              <Tile label="Expenses" val={L(a.exp)} sub={`Average ${L(a.avgExp)} a month over the last ${a.avgExpN} months`} d={delta(a, p, "exp", pl)} tip="Everything the company spent in the period, without GST, counted when incurred." />
              <Tile label="Gross burn" val={L(a.grossBurn)} sub="All cash paid out" d={delta(a, p, "grossBurn", pl)} tip="Total cash that left the bank, before counting anything received." />
              <Tile label="Biggest cost" val={heads ? heads[0][0] : "—"} sub={heads ? `${L(heads[0][1])} · ${pct(heads[0][1] / a.exp)} of expenses` : "Expense heads are not in the workbook yet"} />
            </div></div>
          <Expander title="Where the money went">{heads ? <div className="hbars">{heads.map(([l, v]) => <div className="hb" key={l} data-tt={`<b>${esc(l)}</b><div>${L(v)}<span>${pct(v / a.exp)}</span></div>`}><span className="hl">{l}</span><span className="hbar"><i style={{ width: `${(v / heads[0][1]) * 100}%` }} /></span><span className="hv">{L(v)}</span><span className="hp">{pct(v / a.exp)}</span></div>)}</div> : <NA what="The split of expenses by head" />}</Expander>
          <Expander title="Cash, month by month"><TableOf B={B} cols={[["cashOpen", "Opening"], ["grossBurn", "Paid out"], ["netBurn", "Net burn"], ["cash", "Closing"]]} /></Expander>
        </section>

        <section className="ds"><div className="dsh"><h3>Money owed</h3><span className="gsrc">end of {ymLabel(a.lastYm, true)} · from the debtors ageing</span></div>
          <div className="cbox"><div className="cth"><b>Owed to you: {L(a.rec)}</b><Legend items={ageing.map(([, l, c]) => [l, c])} /></div>
            <div className="agebar">{ageing.map(([kk, l, c]) => <i key={String(kk)} style={{ flex: a[kk] as number, background: c }} data-tt={`<b>${l}</b><div>${L(a[kk] as number)}<span>${pct((a[kk] as number) / a.rec)}</span></div>`} />)}</div>
            <div className="agel">{ageing.map(([kk, l]) => <span key={String(kk)}><b>{L(a[kk] as number)}</b>{l}</span>)}</div></div>
          <div className="tiles4">
            <Tile label="Over 90 days" val={L(a.r90)} sub={`${pct(a.rec ? a.r90 / a.rec : 0)} of what's owed`} d={dDelta(a, p, "r90", pl, L)} flag={a.r90 > 0 ? "amber" : ""} flagNote={a.r90 > 0 ? "Owed for more than 90 days" : ""} tip="Invoices unpaid for more than three months. The longer it waits, the less likely it is to come in." />
            <Tile label="Collected" val={pct(a.collEff)} sub={`${L(a.coll)} of ${L(a.billed)} billed (with GST)`} d={dDelta(a, p, "collEff", pl, (v) => `${Math.round(v * 100)} pts`)} flag={a.collLow2 ? "amber" : ""} flagNote={a.collLow2 ? "Under 80% two months running" : ""} tip="Of what you invoiced in the period, how much actually arrived in the bank." />
            <Tile label="Days to get paid" val={<>{Math.round(a.collDays)} <small>days</small></>} sub="On average, from invoice to cash" d={dDelta(a, p, "collDays", pl, (v) => `${Math.round(v)} days`)} tip="Roughly how long a rupee you bill takes to reach the bank." />
            <Tile label="You owe suppliers" val={L(a.pay)} sub="Bills received, not yet paid" d={dDelta(a, p, "pay", pl, L)} tip="What the company owes vendors, landlords and contractors at the end of the period." />
          </div></section>

        <section className="ds"><div className="dsh"><h3>Taxes and filings</h3><span className="gsrc">from the challans and returns attached in monthly close</span></div>
          {taxKnown ? (
            <div className="dsg"><div className="cbox"><div className="cth"><b>Taxes paid to the government</b><Legend items={taxS.map(([, l], i) => [l, C4[i]])} /></div><StackBars B={B} series={taxS} h={180} /></div>
              <div className="tiles2">
                <Tile label="GST paid" val={L(a.gst)} sub={a.gstOut != null && a.itc != null ? `${L(a.gstOut)} charged on sales − ${L(a.itc)} credit on purchases` : ""} d={delta(a, p, "gst", pl)} tip="GST you collected from clients, less the GST you already paid on your own bills. Only the difference goes to the government, in cash, with the GSTR-3B." />
                <Tile label="TDS paid" val={L(a.tds)} sub={a.tdsSal != null ? `Salaries ${L(a.tdsSal)} · vendors ${L(a.tdsCon)} · rent ${L(a.tdsRent)}` : ""} d={delta(a, p, "tds", pl)} tip="Tax you cut from salaries, contractor and rent payments and deposited for them. It is their tax, held by you, due by the 7th of the next month." />
                <Tile label="Total taxes paid" val={L(a.taxes)} sub={a.otherTax ? `incl. ${L(a.otherTax)} professional tax` : "GST and TDS"} d={delta(a, p, "taxes", pl)} />
                <Tile label="Interest and late fees" val={a.lateFee ? L(a.lateFee) : a.lateFee === 0 ? "None" : "—"} sub={a.lateFee ? a.lateNotes.join(" · ") : a.lateFee === 0 ? "Every payment on time" : ""} flag={a.lateFee ? "amber" : ""} tip="Money paid only because something was late. It is pure loss, so it should stay at zero." />
              </div></div>
          ) : <div className="cbox"><NA what="The tax paid (GST, TDS and professional tax)" /></div>}
          <div className="tiles4">
            <Tile label="Filings for the period" val={a.filT ? (a.filD === a.filT ? "Up to date" : "Behind") : "—"} sub={a.filT ? `${a.filD} of ${a.filT} paid and filed, with proof` : "No filings in this period"} flag={a.filT && a.filD !== a.filT ? "red" : ""} flagNote={a.filT && a.filD !== a.filT ? "Behind" : ""} />
            <Tile label="Open government notices" val={a.notices == null ? "—" : a.notices ? a.notices : "None"} sub={a.notices == null ? "Not in the workbook yet" : ""} tip="Letters from GST, income tax or the Registrar that still need a reply." />
            <Tile label="GST by type" val={a.igst != null && a.cgst != null && a.sgst != null ? L(a.igst + a.cgst + a.sgst) : "—"} sub={a.igst != null ? `IGST ${L(a.igst)} · CGST ${L(a.cgst)} · SGST ${L(a.sgst)}` : "Not in the workbook yet"} tip="IGST is charged on sales to clients in other states; CGST and SGST, split equally, on sales within the company's state." />
            <Tile label="Credit used" val={a.itc != null && a.gstOut ? pct(a.itc / a.gstOut) : "—"} sub={a.itc != null ? "of GST on sales was covered by credit" : "Not in the workbook yet"} tip="The higher this is, the less cash goes out as GST. Credit only counts if your suppliers have reported their bills." />
          </div>
          <Expander title={`Every filing in ${periodName(view, k, true)} (${periodLines.length})`}><div className="flist">{periodLines.length ? periodLines.map((x, i) => <div className="fl" key={i}><span className={`ck ${x.done ? "ok" : ""}`}>{x.done ? "✓" : ""}</span><Link className="lnk" href={`/monthly?m=${x.ym}`} style={{ flex: 1, textDecoration: "none", color: "#1a1a1a", fontWeight: 500 }}>{x.name}</Link><span className="dm">{ymLabel(x.ym)} · due {dshort(x.due)}</span></div>) : <div className="dm">No filings in this period.</div>}</div></Expander>
          <Expander title="Taxes, month by month">{taxKnown ? <TableOf B={B} cols={[["gstOut", "GST on sales"], ["itc", "Credit"], ["gst", "GST paid"], ["tds", "TDS paid"], ["otherTax", "Prof. tax"], ["lateFee", "Interest / fees"]]} /> : <NA what="The monthly tax split" />}</Expander>
        </section>

        <section className="ds lowr">
          <Expander title="Team">{a.emp != null ? <div className="tiles4" style={{ marginTop: 4 }}>
            <Tile label="Team" val={<>{a.emp} <small>people</small></>} sub={a.con != null ? `and ${a.con} contractors` : ""} d={dDelta(a, p, "emp", pl, (v) => String(Math.round(v)))} tip="People on payroll at the end of the period." />
            <Tile label="Salary cost" val={a.expBy ? L(a.expBy.Salaries) : "—"} sub={a.expBy ? `${pct(a.expBy.Salaries / a.exp)} of expenses` : ""} />
            <Tile label="Revenue per person" val={L(a.net / a.n / a.emp)} sub="a month" />
            <Tile label="Cost per person" val={a.expBy ? L(a.expBy.Salaries / a.n / a.emp) : "—"} sub="salary, a month" />
          </div> : <NA what="Headcount and salary cost" />}</Expander>
          <Expander title="Funding, loans and investments"><div className="snap">{([["Money raised", snapshot.rounds], ["Debentures", snapshot.debs], ["Loans", snapshot.loans], ["Investments held", snapshot.holds]] as [string, string[]][]).map(([h, arr]) => <div key={h}><div className="tlab">{h}</div>{arr.length ? arr.map((x) => <div key={x}>{x}</div>) : <div className="dm">None</div>}</div>)}</div><div className="dm" style={{ marginTop: 8 }}>From the company master. <Link className="lnk" href="/dataroom">See the documents in the data room</Link></div></Expander>
          <Expander title="Documents behind these numbers"><div className="flist">{docs.filter((d) => a.months.includes(d.ym)).reverse().map((d) => <div className="fl" key={d.ym}><b style={{ width: 70 }}>{ymLabel(d.ym)}</b>{d.items.length ? d.items.map((n) => <Link key={n} className="lnk" href={`/monthly?m=${d.ym}`}>{n}</Link>) : <span className="dm">Nothing attached</span>}</div>)}</div></Expander>
          <Expander title="How these numbers are worked out"><dl className="defs">{[["Revenue", "Earned in the period, without GST, after partner shares."], ["Net burn", "Cash paid out minus cash received. How fast the bank balance falls."], ["Runway", "Cash, less the fixed deposit, divided by the average net burn of the last three months."], ["Profit or loss", "Revenue minus expenses, counted when earned and incurred, not when cash moved."], ["Recurring revenue", "Subscription revenue. It repeats without being sold again."], ["Days to get paid", "What is owed to you, divided by a month of billing, times 30."], ["Quarters and years", "Financial year, April to March. Q1 is April to June. A quarter with a month still unpublished is compared per month."], ["GST paid", "GST charged on sales minus GST credit on purchases. Only the difference is paid in cash."], ["TDS paid", "Tax cut from salaries, contractors and rent, and deposited with the government."], ["Colours", "Red or amber only on fixed lines: runway under 4 months, filings behind, one client above 40%, dues over 90 days, under 80% collected two months running. Arrows are just direction, not good or bad."]].map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}</dl></Expander>
        </section>
        <div className="dfoot">The figures on this page are prepared by {firmName ?? "the practitioner"} and presented by Prime Bottomline Advisory. Only months Prime Bottomline has checked and published appear here.</div>
      </div>
      <div className="tt" style={{ display: tip ? "block" : "none", left: tip ? Math.min(tip.x + 14, (typeof window !== "undefined" ? window.innerWidth : 1200) - 200) : 0, top: tip ? tip.y + 14 : 0 }} dangerouslySetInnerHTML={{ __html: tip?.html ?? "" }} />
    </div>
  );
}

function AttentionBox({ items, all, setAll, todayLabel }: { items: AttItem[]; all: boolean; setAll: (v: boolean) => void; todayLabel: string }) {
  if (!items.length) return <div className="att none"><span className="dot g" />Nothing needs your attention right now.</div>;
  const shown = all ? items : items.slice(0, 3);
  return (
    <div className="att"><div className="atth"><b>Needs your attention</b><span className="dm">As of today, {todayLabel} — not tied to the period below</span></div>
      {shown.map((x, i) => (
        <div className={`arow ${x.lv}`} key={i}><span className="dot" /><div className="atx"><div>{bold(x.title)}</div>{x.detail && <div className="ad">{bold(x.detail)}</div>}</div>
          {x.act && <Link className={`b ${x.lv === "red" ? "solid" : "quiet"} xs`} href={x.act.href}>{x.act.label}</Link>}</div>
      ))}
      {items.length > 3 && <button className="xph more" onClick={() => setAll(!all)}><span className={`chev ${all ? "r" : ""}`}>›</span>{all ? "Show fewer" : `${items.length - 3} more`}</button>}
    </div>
  );
}
