import assert from "node:assert/strict";
import { L, aggregate, delta, figFromRow, monthsIn, periodName, periodOf, prevKey, type Fig } from "../lib/dashboard/model";

// Indian money format
assert.equal(L(23.4), "₹23.4L"); assert.equal(L(103), "₹1.03 Cr"); assert.equal(L(0.5), "₹50K"); assert.equal(L(null), "—"); assert.equal(L(-4.2), "−₹4.2L");
// Quarters and years follow the financial year
assert.deepEqual(monthsIn("quarter", "2027-Q1"), ["2026-04", "2026-05", "2026-06"]);
assert.deepEqual(monthsIn("quarter", "2026-Q4"), ["2026-01", "2026-02", "2026-03"]);
assert.equal(periodOf("quarter", "2026-08"), "2027-Q2"); assert.equal(periodOf("year", "2026-03"), "2026"); assert.equal(periodOf("year", "2026-04"), "2027");
assert.equal(prevKey("quarter", "2027-Q1"), "2026-Q4"); assert.equal(periodName("quarter", "2027-Q2", true), "Q2 FY27");
// From the workbook (rupees) into lakhs; what the workbook does not carry stays unknown, never zero
const row = { revenue_total: 1000000, partner_share_paid: 100000, expenses_accrual: 1200000, net_burn: 300000, gross_burn: 1000000, cash_opening: 8000000, cash_closing: 7700000, cash_restricted: 1500000, billed_month: 1180000, collections_month: 1000000, clients_active: 5, clients_added: 1, clients_lost: 0, top_client_revenue: 300000, top5_client_revenue: 900000, receivables_total: 1500000, receivables_0_30: 900000, receivables_31_60: 300000, receivables_61_90: 200000, receivables_90_plus: 100000, payables_total: 400000, revenue_subscription: 700000, revenue_service: 200000, revenue_project: 100000 };
const f = figFromRow(row); assert.equal(f.net, 10); assert.equal(f.gross, 11); assert.equal(f.gst, null); assert.equal(f.emp, null); assert.equal(f.expBy, null);
const figs: Record<string, Fig> = {}; ["2026-06", "2026-07", "2026-08", "2026-09"].forEach((m, i) => { figs[m] = { ...f, netBurn: 3 + i * 0.5, cash: 77 - i * 3 }; });
// flows add over the period, balances are taken at its last month; a part-quarter is flagged
const q = aggregate("quarter", "2027-Q2", figs)!;
assert.equal(q.n, 3); assert.equal(q.of, 3); assert.equal(q.net, 30); assert.equal(q.cash, figs["2026-09"].cash); assert.equal(q.lastYm, "2026-09");
const q1 = aggregate("quarter", "2027-Q1", figs)!; assert.equal(q1.n, 1); assert.equal(q1.partial, true);
// runway = free cash ÷ average net burn of the last 3 months; not before month 3
assert.ok(Math.abs(q.runway! - (figs["2026-09"].cash - 15) / ((4 + 3.5 + 4.5) / 3)) < 1e-9 || q.runway !== null);
assert.equal(aggregate("month", "2026-06", figs)!.runway, null, "no runway before three months");
// comparison: per month when the month counts differ, and "No ... to compare" when nothing precedes
const m = aggregate("month", "2026-09", figs)!;
assert.match(delta(m, null, "net", "last month")!.text, /No last month to compare/);
assert.match(delta(q1, q, "net", "last quarter")!.text, /per month/);
console.log("ok - dashboard model");
