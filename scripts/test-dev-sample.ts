import assert from "node:assert/strict";
import { data } from "./fixture";
import { buildPlan } from "../lib/master/engine";
import { cashFor, sampleAnswers, sampleMonths, sampleRow } from "../lib/dev/sample";
import { checkId } from "../lib/idformats";
const a = sampleAnswers();
// the sample answers obey the same ID rules the wizard enforces
assert.equal(checkId("pan", a.details!.pan, a), null); assert.equal(checkId("tan", a.details!.tan, a), null); assert.equal(checkId("cin", a.details!.cin, a), null);
assert.equal(checkId("gstin", a.gst!.gstins![0].gstin, a, a.gst!.gstins![0]), null);
const plan = buildPlan(a, data, new Date(Date.UTC(2026, 9, 27)));
assert.ok(plan.standard.length >= 10 && plan.events.length === 3 && plan.filings.length >= 3, "a finished master asks for documents, three events and filings");
const months = sampleMonths(); assert.equal(months.length, 18); assert.equal(months[0], "2025-04"); assert.equal(months[17], "2026-09");
const last = sampleRow(17, "2026-09", cashFor(17)); assert.equal(last.cash_closing, 1840000, "ends at ₹18.4L");
const first = sampleRow(0, "2025-04", cashFor(0)); assert.ok(first.cash_closing > last.cash_closing, "cash falls over the period");
assert.equal(sampleRow(10, "2026-02", cashFor(10)).interest_fees > 0, true, "one month has late fees with a reason");
for (let i = 0; i < 18; i++) { const r = sampleRow(i, months[i], cashFor(i)); const heads = r.exp_salaries + r.exp_contractors + r.exp_cloud + r.exp_marketing + r.exp_rent + r.exp_travel + r.exp_software + r.exp_other; assert.ok(Math.abs(heads - r.expenses_accrual) <= 8, `heads add up in month ${i}`); }
console.log("ok - dev sample data");
