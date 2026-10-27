// The prototype's Xploro, for the test company: the answers a finished master holds, and eighteen months of figures. Sample only.
import type { Answers } from "@/lib/master/types";
import { ymAdd } from "@/lib/dashboard/model";

export const SAMPLE_FROM = "2025-04";
export const sampleAnswers = (): Answers => ({
  ack: {},
  entity: "private", incorporatedOn: "2023-06-12", trackingStart: SAMPLE_FROM,
  details: { legalName: "Xploro Technologies Private Limited", cin: "U72900DL2023PTC123456", pan: "AABCX1234F", tan: "DELX12345A", state: "Delhi" },
  books: { software: "Tally", closer: "firm", firmOnPortal: true, firmName: "SPARC & Co" },
  banks: [{ id: "b1", bank: "HDFC Bank", type: "Current", last4: "1123" }],
  gst: { registered: true, gstins: [{ id: "g1", gstin: "07AABCX1234F1ZO", state: "Delhi", scheme: "regular" }] },
  salaries: { pays: true, employees: 14, contractors: 5, payrollTool: "Excel", pf: false, esi: false, ptStates: ["None"], foundersPaid: true },
  tds: { types: ["salaries", "vendors"] },
  revenue: { types: ["Subscription", "Service"], partners: true, sharing: "full", gateways: ["Razorpay", "PayU"], advances: false, exports: true },
  has: { loans: true, debentures: false, rounds: true, investments: false },
  loans: [{ id: "l1", lender: "HDFC Bank", type: "Term loan", sanctioned: 2500000, takenOn: "2025-06-01", secured: false }],
  debentures: [],
  rounds: [{ id: "r1", round: "Seed round", instrument: "ccd", closedOn: "2025-09-01", amount: 1000000, foreign: false }],
  investments: [],
});

// Figures in lakhs for Apr 2025 – Sep 2026 (18 months), as in the prototype. Returned in rupees for the database.
const gross = [3.2, 3.5, 4.0, 4.6, 5.0, 5.4, 6.1, 6.8, 7.0, 7.9, 8.6, 9.4, 9.5, 10.1, 10.6, 10.6, 11.2, 11.6];
const partner = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.2, 0.3, 0.4, 0.6, 0.7, 0.8];
const exp = [6.8, 7.0, 7.1, 7.6, 7.9, 8.2, 8.8, 9.0, 9.3, 10.1, 10.4, 10.8, 11.6, 11.9, 12.2, 12.6, 12.9, 13.2];
const nb = [3.9, 3.7, 3.4, 3.3, 3.1, 3.2, 2.9, 2.6, 2.7, 2.5, 2.2, 1.9, 2.4, 2.3, 2.0, 2.6, 2.4, 2.5];
const eff = [0.92, 0.88, 0.95, 0.9, 0.86, 0.93, 0.91, 0.89, 0.94, 0.9, 0.92, 0.88, 0.93, 0.9, 0.87, 0.79, 0.84, 0.9];
const add = [1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 2, 1, 1, 1, 1, 0, 1, 1], lost = [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1];
const top = [0.48, 0.47, 0.46, 0.45, 0.44, 0.45, 0.43, 0.42, 0.43, 0.41, 0.4, 0.42, 0.43, 0.44, 0.44, 0.45, 0.44, 0.43];
const o90 = [0.2, 0.2, 0.3, 0.2, 0.4, 0.3, 0.3, 0.5, 0.4, 0.6, 0.9, 1.2, 1.4, 1.4, 1.5, 1.6, 1.6, 1.7];
const emp = [8, 8, 9, 9, 10, 10, 10, 11, 11, 12, 12, 12, 13, 13, 14, 14, 14, 14], con = [2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3];
const SHARE = { exp_salaries: 0.56, exp_contractors: 0.11, exp_cloud: 0.09, exp_marketing: 0.06, exp_rent: 0.05, exp_travel: 0.04, exp_software: 0.03, exp_other: 0.06 };
const R = (lakhs: number) => Math.round(lakhs * 1e5);

export function sampleMonths(): string[] { return Array.from({ length: 18 }, (_, i) => ymAdd(SAMPLE_FROM, i)); }

export function sampleRow(i: number, ym: string, cash: { open: number; close: number }) {
  const net = gross[i] - partner[i], t = i / 17;
  let sub = 0.62 + 0.18 * t, svc = 0.26 - 0.12 * t; if (i === 5 || i === 13) svc += 0.04;
  const proj = 1 - sub - svc, billed = gross[i] * 1.18, coll = billed * eff[i], rec = billed * 1.25, rest = rec - o90[i];
  const heads = Object.fromEntries(Object.entries(SHARE).map(([k, s]) => [k, R(exp[i] * s)])) as Record<keyof typeof SHARE, number>;
  const out = gross[i] * 0.18, itcBase = exp[i] * (SHARE.exp_cloud + SHARE.exp_software + SHARE.exp_rent + SHARE.exp_marketing + SHARE.exp_other * 0.5 + SHARE.exp_contractors * 0.3), itc = itcBase * 0.18;
  const late = ym === "2026-02";
  return {
    period: ym,
    cash_opening: R(cash.open), cash_closing: R(cash.close), cash_restricted: R(15), gross_burn: R(nb[i] + coll / 1.18), net_burn: R(nb[i]), expenses_accrual: R(exp[i]),
    revenue_total: R(net), revenue_subscription: R(net * sub), revenue_service: R(net * svc), revenue_project: R(net * proj), partner_share_paid: R(partner[i]),
    clients_active: 5 + add.slice(0, i + 1).reduce((a, b) => a + b, 0) - lost.slice(0, i + 1).reduce((a, b) => a + b, 0), clients_added: add[i], clients_lost: lost[i],
    top_client_revenue: R(net * top[i]), top5_client_revenue: R(net * Math.min(0.97, 0.97 - 0.11 * t)),
    receivables_total: R(rec), receivables_0_30: R(rest * 0.66), receivables_31_60: R(rest * 0.24), receivables_61_90: R(rest * 0.1), receivables_90_plus: R(o90[i]),
    payables_total: R(exp[i] * 0.38), billed_month: R(billed), collections_month: R(coll),
    gst_output: R(out), gst_itc: R(itc), gst_paid_cash: R(out - itc), igst: R(out * 0.6), cgst: R(out * 0.2), sgst: R(out * 0.2),
    tds_salary: R(exp[i] * SHARE.exp_salaries * 0.07), tds_vendor: R(exp[i] * SHARE.exp_contractors * 0.1), tds_rent: R(exp[i] * SHARE.exp_rent * 0.1),
    pt_paid: 0, interest_fees: late ? R(0.0184) : 0, interest_note: late ? "Interest on January TDS, deposited 4 days late" : null,
    employees: emp[i], contractors: con[i], notices_open: 0, ...heads,
  };
}

// Cash walks back from ₹18.4L at the end of Sep 2026 using each month's net burn.
export function cashFor(i: number): { open: number; close: number } {
  let close = 18.4; for (let k = 17; k > i; k--) close += nb[k];
  return { close, open: close + nb[i] };
}
