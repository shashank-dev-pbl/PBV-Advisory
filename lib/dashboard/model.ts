// Dashboard v2 (spec 08): published months only, flows add up over the period, balances are taken at its last month, and every
// comparison is against the previous period only. Pure functions so the numbers can be tested. Money is held in lakhs here
// (the MIS workbook stores rupees), and anything the workbook does not carry yet is null — never shown as zero.

export type View = "month" | "quarter" | "year";
export type Fig = {
  net: number; partner: number; gross: number; exp: number; netBurn: number; grossBurn: number; cashOpen: number; cash: number; restricted: number;
  billed: number; coll: number; clients: number; added: number; lost: number; top: number; top5: number;
  rec: number; r0: number; r30: number; r60: number; r90: number; pay: number;
  sub: number; svc: number; proj: number;
  // not in the MIS workbook yet (needs template v1.1): null until it is
  expBy: Record<string, number> | null; emp: number | null; con: number | null;
  gstOut: number | null; itc: number | null; gst: number | null; igst: number | null; cgst: number | null; sgst: number | null;
  tdsSal: number | null; tdsCon: number | null; tdsRent: number | null; tds: number | null; pt: number | null; lateFee: number | null; lateNote: string; notices: number | null;
};

const L5 = 1e5;
type Row = Record<string, number | null | string>;
// A published period_figures row (rupees) → the dashboard's shape (lakhs).
export function figFromRow(r: Row): Fig {
  const n = (k: string) => (typeof r[k] === "number" ? (r[k] as number) / L5 : 0);
  const opt = (k: string) => (typeof r[k] === "number" ? (r[k] as number) / L5 : null);
  const net = n("revenue_total"), partner = n("partner_share_paid");
  return {
    net, partner, gross: net + partner, exp: n("expenses_accrual"), netBurn: n("net_burn"), grossBurn: n("gross_burn"), cashOpen: n("cash_opening"), cash: n("cash_closing"), restricted: n("cash_restricted"),
    billed: n("billed_month"), coll: n("collections_month"), clients: typeof r.clients_active === "number" ? r.clients_active : 0, added: typeof r.clients_added === "number" ? r.clients_added : 0, lost: typeof r.clients_lost === "number" ? r.clients_lost : 0,
    top: n("top_client_revenue"), top5: n("top5_client_revenue"), rec: n("receivables_total"), r0: n("receivables_0_30"), r30: n("receivables_31_60"), r60: n("receivables_61_90"), r90: n("receivables_90_plus"), pay: n("payables_total"),
    sub: n("revenue_subscription"), svc: n("revenue_service"), proj: n("revenue_project"),
    expBy: null, emp: typeof r.employees === "number" ? r.employees : null, con: typeof r.contractors === "number" ? r.contractors : null,
    gstOut: opt("gst_output"), itc: opt("gst_itc"), gst: opt("gst_paid_cash"), igst: opt("igst"), cgst: opt("cgst"), sgst: opt("sgst"),
    tdsSal: opt("tds_salary"), tdsCon: opt("tds_vendor"), tdsRent: opt("tds_rent"), tds: null, pt: opt("pt_paid"), lateFee: opt("interest_fees"), lateNote: typeof r.interest_note === "string" ? r.interest_note : "", notices: typeof r.notices_open === "number" ? r.notices_open : null,
  };
}

/* ---------- periods ---------- */
export const ymAdd = (ym: string, n: number) => { let y = +ym.slice(0, 4), m = +ym.slice(5) + n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return `${y}-${String(m).padStart(2, "0")}`; };
export const fyOf = (ym: string) => { const y = +ym.slice(0, 4), m = +ym.slice(5); return m >= 4 ? y + 1 : y; };
export const fyLabel = (fy: number) => `FY${String(fy).slice(2)}`;
export const qOf = (ym: string) => { const m = +ym.slice(5); return m >= 4 && m <= 6 ? 1 : m >= 7 && m <= 9 ? 2 : m >= 10 ? 3 : 4; };
export const periodOf = (view: View, ym: string) => (view === "month" ? ym : view === "quarter" ? `${fyOf(ym)}-Q${qOf(ym)}` : String(fyOf(ym)));
export function monthsIn(view: View, key: string): string[] {
  if (view === "month") return [key];
  if (view === "quarter") { const [fy, q] = key.split("-Q").map(Number); const sm = [4, 7, 10, 1][q - 1]; const y = q === 4 ? fy : fy - 1; return [0, 1, 2].map((i) => ymAdd(`${y}-${String(sm).padStart(2, "0")}`, i)); }
  return Array.from({ length: 12 }, (_, i) => ymAdd(`${+key - 1}-04`, i));
}
const mon = (ym: string, long?: boolean) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-IN", { month: long ? "long" : "short", year: long ? "numeric" : "2-digit" }).replace(/ (\d\d)$/, " ’$1");
export const ymLabel = mon;
export function periodName(view: View, key: string, short?: boolean) {
  if (view === "month") return mon(key, !short);
  if (view === "quarter") { const [fy, q] = key.split("-Q"); const ms = monthsIn(view, key); const sm = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short" }).slice(0, 3); return short ? `Q${q} ${fyLabel(+fy)}` : `Q${q} ${fyLabel(+fy)} · ${sm(ms[0])}–${sm(ms[2])} ${ms[2].slice(0, 4)}`; }
  return short ? fyLabel(+key) : `${fyLabel(+key)} · Apr ${+key - 1} – Mar ${key}`;
}
export function prevKey(view: View, key: string) {
  if (view === "month") return ymAdd(key, -1);
  if (view === "quarter") { let [fy, q] = key.split("-Q").map(Number); q--; if (q < 1) { q = 4; fy--; } return `${fy}-Q${q}`; }
  return String(+key - 1);
}

/* ---------- formatting: Indian, ₹23.4L / ₹1.03 Cr; never 0 for unknown ---------- */
export function L(x: number | null | undefined): string {
  if (x == null || Number.isNaN(x)) return "—";
  const a = Math.abs(x), s = x < 0 ? "−" : "";
  if (a >= 100) return `${s}₹${(a / 100).toFixed(a >= 1000 ? 1 : 2).replace(/\.?0+$/, "")} Cr`;
  if (a === 0) return "₹0";
  if (a < 1) return `${s}₹${Math.round(a * 100)}K`;
  return `${s}₹${a.toFixed(a >= 10 ? 1 : 2).replace(/(\.\d)0$/, "$1").replace(/\.0$/, "")}L`;
}
export const pct = (x: number | null) => (x == null || Number.isNaN(x) ? "—" : `${Math.round(x * 100)}%`);

/* ---------- aggregation ---------- */
export type Agg = Fig & {
  months: string[]; n: number; of: number; lastYm: string; partial: boolean; pl: number; mrr: number; arr: number;
  avgBurn: number | null; runway: number | null; avgExp: number; avgExpN: number; topShare: number; top5Share: number; collEff: number; collDays: number; recurring: number; perClient: number; collLow2: boolean;
  taxes: number | null; otherTax: number | null; lateNotes: string[]; filT: number; filD: number;
};
const FLOWS = ["net", "partner", "gross", "exp", "netBurn", "grossBurn", "billed", "coll", "added", "lost", "top", "top5", "sub", "svc", "proj"] as const;
const OPT_FLOWS = ["gstOut", "itc", "gst", "igst", "cgst", "sgst", "tdsSal", "tdsCon", "tdsRent", "pt", "lateFee"] as const;
const BALANCES = ["cash", "restricted", "rec", "r0", "r30", "r60", "r90", "pay", "clients"] as const;

export function aggregate(view: View, key: string, figs: Record<string, Fig>, filings: Record<string, { total: number; done: number }> = {}): Agg | null {
  const all = monthsIn(view, key), ms = all.filter((m) => figs[m]);
  if (!ms.length) return null;
  const F = ms.map((m) => figs[m]), last = F[F.length - 1], lastYm = ms[ms.length - 1];
  const sum = (k: (typeof FLOWS)[number]) => F.reduce((a, f) => a + f[k], 0);
  const optSum = (k: (typeof OPT_FLOWS)[number]) => (F.every((f) => f[k] != null) ? F.reduce((a, f) => a + (f[k] as number), 0) : null);
  const out = { ...last, months: ms, n: ms.length, of: all.length, lastYm, partial: ms.length < all.length } as Agg;
  for (const k of FLOWS) out[k] = sum(k);
  for (const k of OPT_FLOWS) out[k] = optSum(k);
  for (const k of BALANCES) out[k] = last[k];
  out.cashOpen = F[0].cashOpen;
  out.tds = [out.tdsSal, out.tdsCon, out.tdsRent].every((v) => v != null) ? (out.tdsSal as number) + (out.tdsCon as number) + (out.tdsRent as number) : null;
  out.taxes = out.gst != null && out.tds != null ? out.gst + out.tds + (out.pt ?? 0) : null;
  out.otherTax = out.pt;
  out.expBy = F.every((f) => f.expBy) ? Object.fromEntries(Object.keys(F[0].expBy!).map((k) => [k, F.reduce((s, f) => s + f.expBy![k], 0)])) : null;
  out.pl = out.net - out.exp;
  out.mrr = last.sub; out.arr = last.sub * 12;
  // runway: free cash ÷ the average net burn of the 3 months ending at the period's end
  const back = [0, 1, 2].map((i) => ymAdd(lastYm, -i));
  out.avgBurn = back.every((m) => figs[m]) ? back.reduce((s, m) => s + figs[m].netBurn, 0) / 3 : null;
  out.runway = out.avgBurn && out.avgBurn > 0 ? (out.cash - out.restricted) / out.avgBurn : null;
  const five = [0, 1, 2, 3, 4].map((i) => ymAdd(lastYm, -i)).filter((m) => figs[m]);
  out.avgExp = five.reduce((s, m) => s + figs[m].exp, 0) / five.length; out.avgExpN = five.length;
  out.topShare = out.net ? out.top / out.net : 0; out.top5Share = out.net ? out.top5 / out.net : 0; out.collEff = out.billed ? out.coll / out.billed : 0;
  out.collDays = out.billed ? (out.rec / (out.billed / out.n)) * 30 : 0; out.recurring = out.net ? out.sub / out.net : 0; out.perClient = out.clients ? out.net / out.n / out.clients : 0;
  out.collLow2 = [lastYm, ymAdd(lastYm, -1)].every((m) => figs[m] && figs[m].billed > 0 && figs[m].coll / figs[m].billed < 0.8);
  out.lateNotes = ms.filter((m) => figs[m].lateNote).map((m) => `${mon(m)}: ${figs[m].lateNote}`);
  out.filT = ms.reduce((s, m) => s + (filings[m]?.total ?? 0), 0); out.filD = ms.reduce((s, m) => s + (filings[m]?.done ?? 0), 0);
  return out;
}

/* ---------- change against the previous period (flows per month when the month counts differ) ---------- */
const FLOW_KEYS = new Set<string>([...FLOWS, "pl", "gst", "tds", "taxes", "otherTax", "lateFee", "gstOut", "itc"]);
export type Delta = { text: string; na?: boolean } | null;
export function delta(a: Agg, p: Agg | null, k: keyof Agg, label: string): Delta {
  if (!p) return { text: `No ${label} to compare`, na: true };
  const av = a[k], pv = p[k];
  if (typeof av !== "number" || typeof pv !== "number") return null;
  const per = FLOW_KEYS.has(k as string) && a.n !== p.n;
  const x = per ? av / a.n : av, y = per ? pv / p.n : pv;
  if (Math.abs(y) < 1e-9) return null;
  const ch = (x - y) / Math.abs(y), up = x > y, flat = Math.abs(ch) < 0.005;
  if (Math.abs(ch) > 3) return { text: `${up ? "↑" : "↓"} from ${L(y)}${per ? " a month" : ""} in ${label}` };
  return { text: `${flat ? "→ Flat" : `${up ? "↑" : "↓"} ${Math.abs(ch * 100).toFixed(Math.abs(ch) < 0.1 ? 1 : 0)}%`} on ${label}${per ? " (per month)" : ""}` };
}
export function dDelta(a: Agg, p: Agg | null, k: keyof Agg, label: string, fmt: (v: number) => string): Delta {
  if (!p) return { text: `No ${label} to compare`, na: true };
  const av = a[k], pv = p[k];
  if (typeof av !== "number" || typeof pv !== "number") return null;
  const d = av - pv;
  return { text: `${Math.abs(d) < 1e-6 ? "→ Same" : `${d > 0 ? "↑" : "↓"} ${fmt(Math.abs(d))}`} on ${label}` };
}

/* ---------- chart buckets ---------- */
export type Bucket = { k: string; lab: string; a: Agg | null; cur: boolean };
export function bucketsFor(view: View, key: string, figs: Record<string, Fig>, filings: Record<string, { total: number; done: number }>): Bucket[] {
  const lab = (m: string) => mon(m).replace(" ’", "\n’");
  if (view === "month") return Array.from({ length: 12 }, (_, i) => { const m = ymAdd(key, -(11 - i)); return { k: m, lab: lab(m), a: figs[m] ? aggregate("month", m, figs, filings) : null, cur: i === 11 }; });
  if (view === "quarter") {
    const ks = periodsAvailable("quarter", figs); const i = ks.indexOf(key);
    return ks.slice(Math.max(0, i - 7), i + 1).map((k) => ({ k, lab: periodName("quarter", k, true).replace(" ", "\n"), a: aggregate("quarter", k, figs, filings), cur: k === key }));
  }
  return monthsIn("year", key).map((m) => ({ k: m, lab: lab(m), a: figs[m] ? aggregate("month", m, figs, filings) : null, cur: false }));
}
export function periodsAvailable(view: View, figs: Record<string, Fig>): string[] {
  const s: string[] = [];
  Object.keys(figs).sort().forEach((m) => { const k = periodOf(view, m); if (!s.includes(k)) s.push(k); });
  return s;
}
export const niceTicks = (max: number) => { const raw = max / 4; const p = Math.pow(10, Math.floor(Math.log10(raw))); const s = [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= raw) ?? p; return [0, 1, 2, 3, 4].map((i) => +(i * s).toFixed(6)).filter((t, i, a) => i === 0 || a[i - 1] < max); };
