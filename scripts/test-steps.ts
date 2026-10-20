import assert from "node:assert/strict";
import { STEPS, answered, visibleQuestions } from "../lib/master/steps";
import type { Answers } from "../lib/master/types";

// A blank master: step 1's first question is the only one open, and nothing downstream is asked yet.
const blank: Answers = {};
const first = visibleQuestions(STEPS[0], blank);
assert.equal(answered(first[0], blank), false);
assert.equal(STEPS.length, 12);

// "No" is an answer, and it hides the rows question that depends on it.
const noLoans: Answers = { has: { loans: false } };
const s8 = visibleQuestions(STEPS[7], noLoans);
assert.deepEqual(s8.map((q) => q.id), ["hasLoans", "docs-loans"], "no rows question when there are no loans");
assert.equal(answered(s8[0], noLoans), true);
const yesLoans: Answers = { has: { loans: true } };
assert.ok(visibleQuestions(STEPS[7], yesLoans).some((q) => q.id === "loans"));
assert.equal(answered(visibleQuestions(STEPS[7], yesLoans).find((q) => q.id === "loans")!, yesLoans), false, "rows need at least one row");

// Required fields: name, PAN and state are required for the details question
const details = STEPS[0].questions.find((q) => q.id === "details")!;
assert.equal(answered(details, { details: { legalName: "X", pan: "AAAAA0000A" } }), false);
assert.equal(answered(details, { details: { legalName: "X", pan: "AAAAA0000A", state: "Tamil Nadu" } }), true);

// Xploro's complete answers satisfy every question of every step
const xploro: Answers = {
  entity: "private", incorporatedOn: "2023-06-12", trackingStart: "2026-04",
  details: { legalName: "Xploro", pan: "AAAAA0000A", tan: "BLRX00000X", state: "Tamil Nadu" },
  books: { software: "Tally", closer: "firm", firmOnPortal: true, firmName: "SPARC & Co" },
  banks: [{ id: "b1", bank: "HDFC", type: "Current", last4: "1234" }],
  gst: { registered: true, gstins: [{ id: "g1", gstin: "33AAAAA0000A1Z5", state: "Tamil Nadu", scheme: "regular" }] },
  salaries: { pays: true, employees: 14, contractors: 5, pf: false, esi: false, ptStates: ["None"], foundersPaid: true },
  tds: { types: ["salaries", "vendors"] },
  revenue: { types: ["Subscription"], partners: true, sharing: "full", gateways: ["Razorpay", "PayU"], advances: false, exports: true },
  has: { loans: true, debentures: false, rounds: true, investments: false },
  loans: [{ id: "l1", lender: "HDFC", type: "Term loan", secured: false }],
  debentures: [], investments: [],
  rounds: [{ id: "r1", round: "Bridge", instrument: "ccd", amount: 1000000, foreign: false }],
};
for (const s of STEPS) for (const q of visibleQuestions(s, xploro)) assert.equal(answered(q, xploro), true, `step ${s.n}: ${q.id}`);
console.log("ok - master steps: all assertions passed");
