import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPlan, filingsForPeriod, requestsForPeriod, conditionKeys, type EngineData } from "../lib/master/engine";
import type { Answers } from "../lib/master/types";

// The data the portal loads from the database, here read from the same files the seed is built from.
const json = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const csv = (p: string) => readFileSync(p, "utf8").replace(/^﻿/, "").trim().split(/\r?\n/).slice(1).map((l) => {
  const out: string[] = []; let cur = "", q = false;
  for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch; }
  out.push(cur); return out;
});
const data: EngineData = {
  rules: json("data/master/rules.json"),
  filings: json("data/master/filings.json"),
  eventDocs: csv("data/b4/03-event-document-list.csv").filter((r) => r[4]).map((r) => ({ event_type: r[0], doc_code: r[4], need: r[3] === "expected" ? "expected" : "if_applies", condition_note: r[7] || null })),
  library: csv("data/b4/04-document-library.csv").map((r) => ({ code: r[0], name: r[1], form: r[2] || null })),
};
const today = new Date(Date.UTC(2026, 9, 20)); // 20 Oct 2026

// every rule and filing must use a condition the engine knows
const known = new Set(conditionKeys());
for (const r of [...data.rules, ...data.filings]) assert.ok(known.has(r.cond), `unknown condition ${r.cond}`);

// A blank master asks for nothing.
const blank = buildPlan({}, data, today);
assert.equal(blank.events.length, 0, "blank: events");
assert.equal(blank.filings.length, 0, "blank: filings");
assert.deepEqual(blank.standard.map((s) => s.rule_id).sort(), ["R06", "R11", "R35"], "blank: only what always applies");
// (PAN, opening trial balance and client list are asked of every company; a master with no answers is a stub, not a company)
assert.equal(requestsForPeriod(blank, "2026-08").filter((r) => r.rule_id !== "R12" && r.rule_id !== "R13" && r.rule_id !== "R14" && r.rule_id !== "R36" && r.rule_id !== "R37").length, 0, "blank: no optional monthly items");

// Xploro, as in 11 — What Each Step Adds
const xploro: Answers = {
  entity: "private", incorporatedOn: "2023-06-12", trackingStart: "2026-04",
  details: { legalName: "Xploro", pan: "AAAAA0000A", tan: "BLRX00000X", state: "Tamil Nadu" },
  books: { software: "Tally", closer: "firm", firmOnPortal: true, firmName: "SPARC & Co" },
  banks: [{ id: "b1", bank: "HDFC", type: "Current", last4: "1234" }],
  gst: { registered: true, gstins: [{ id: "g1", gstin: "33AAAAA0000A1Z5", state: "Tamil Nadu", scheme: "regular" }] },
  salaries: { pays: true, employees: 14, contractors: 5, pf: false, esi: false, ptStates: [], foundersPaid: true },
  tds: { types: ["salaries", "vendors"] },
  revenue: { types: ["subscription", "service"], partners: true, sharing: "full", gateways: ["Razorpay", "PayU"], advances: false, exports: true },
  loans: [{ id: "l1", lender: "HDFC", type: "Term loan", secured: false, takenOn: "2024-03-01" }],
  debentures: [],
  rounds: [{ id: "r1", round: "Bridge", instrument: "ccd", closedOn: "2025-09-01", amount: 1000000, foreign: false }],
  investments: [],
};
const p = buildPlan(xploro, data, today);
assert.equal(p.standard.length, 11, "standard documents");
assert.deepEqual(p.standard.map((s) => s.rule_id).sort(), ["R01", "R02", "R06", "R07", "R08", "R11", "R17", "R23", "R35", "R38", "R54"].sort());
assert.equal(p.events.length, 3, "timeline events");
const incorp = p.events.find((e) => e.kind === "incorp")!;
assert.equal(incorp.docs.length, 11, "incorporation documents");
assert.equal(incorp.docs.filter((d) => !d.sharedWith).length, 8, "8 are new (certificate, PAN, TAN are shared)");
assert.equal(p.events.find((e) => e.kind === "ccd")!.docs.length, 14, "CCD round documents");
assert.equal(p.events.find((e) => e.kind === "loan")!.docs.length, 6, "loan documents");
assert.equal(p.events.reduce((n, e) => n + e.docs.filter((d) => !d.sharedWith).length, 0), 28, "28 new documents on the timeline");

const aug = requestsForPeriod(p, "2026-08");     // a month that is not a quarter end
const fromCo = aug.filter((r) => r.section === "from_company"), books = aug.filter((r) => r.section === "books");
assert.equal(fromCo.length, 10, "from the company, per month: " + fromCo.map((r) => r.name).join(" | "));
assert.equal(books.length, 7, "books, per month: " + books.map((r) => r.name).join(" | "));
assert.ok(books.every((r) => r.owner === "external"), "books belong to SPARC (on the portal)");
assert.ok(fromCo.every((r) => r.owner === "founder"));
assert.ok(fromCo.every((r) => r.due === "2026-09-03") && books.every((r) => r.due === "2026-09-07"), "one set of due dates: 3rd and 7th");
const augF = filingsForPeriod(p, "2026-08");
assert.equal(augF.length, 3, "filings: " + augF.map((f) => f.name).join(" | "));
assert.equal(augF.reduce((n, f) => n + f.ticks.length, 0), 4, "GSTR-1 (1), GSTR-3B (2), TDS payment (1)");
assert.equal(augF.find((f) => f.filing_id === "F01")!.due, "2026-09-11");
assert.equal(augF.find((f) => f.filing_id === "F02")!.due, "2026-09-20");
assert.equal(augF.find((f) => f.filing_id === "F07")!.due, "2026-09-07");

const sep = requestsForPeriod(p, "2026-09");     // a quarter end
assert.equal(sep.filter((r) => r.section === "from_company").length, 11, "+ founder remuneration");
assert.equal(sep.filter((r) => r.section === "books").length, 8, "+ TDS working");
const sepF = filingsForPeriod(p, "2026-09");
assert.equal(sepF.length, 5, "+ salary return and non-salary return: " + sepF.map((f) => f.name).join(" | "));
assert.equal(sepF.find((f) => f.filing_id === "F08")!.due, "2026-10-31", "Q2 return due 31 Oct");
assert.equal(filingsForPeriod(p, "2026-12").find((f) => f.filing_id === "F08")!.due, "2027-01-31", "Q3 return falls in the next year");
assert.equal(filingsForPeriod(p, "2027-03").find((f) => f.filing_id === "F07")!.due, "2027-04-30", "March TDS is due 30 April");

// Changing answers: adding an account adds a request; removing a loan removes its event and statement
const two = buildPlan({ ...xploro, banks: [...xploro.banks!, { id: "b2", bank: "ICICI", type: "Current", last4: "9999" }] }, data, today);
assert.equal(requestsForPeriod(two, "2026-08").filter((r) => r.rule_id === "R16").length, 2);
const noLoan = buildPlan({ ...xploro, loans: [] }, data, today);
assert.equal(noLoan.events.length, 2);
assert.equal(requestsForPeriod(noLoan, "2026-08").some((r) => r.rule_id === "R47"), false);
// Prime Bottomline closes the books: no MIS upload, and books move to the PBA practitioner
const pbaBooks = buildPlan({ ...xploro, books: { closer: "pba" } }, data, today);
const pb = requestsForPeriod(pbaBooks, "2026-08").filter((r) => r.section === "books");
assert.equal(pb.length, 6, "MIS is not asked when PBA closes the books");
assert.ok(pb.every((r) => r.owner === "pba"));
// A firm not yet on the portal: its items go to the PBA practitioner until it joins
const notOnPortal = buildPlan({ ...xploro, books: { closer: "firm", firmOnPortal: false } }, data, today);
assert.ok(requestsForPeriod(notOnPortal, "2026-08").filter((r) => r.section === "books").every((r) => r.owner === "pba"));
// Own team closes the books: the founder
const ownTeam = buildPlan({ ...xploro, books: { closer: "own" } }, data, today);
assert.ok(requestsForPeriod(ownTeam, "2026-08").filter((r) => r.section === "books").every((r) => r.owner === "founder"));
// PF, ESI and PT add filings, not documents
const pf = buildPlan({ ...xploro, salaries: { ...xploro.salaries, pf: true, esi: true, ptStates: ["Karnataka", "Tamil Nadu"] } }, data, today);
const pfAug = filingsForPeriod(pf, "2026-08");
assert.equal(pfAug.length, 3 + 3, "PF, ESI and Karnataka PT in August; Tamil Nadu PT only in Sept and March");
assert.equal(filingsForPeriod(pf, "2026-09").some((f) => f.name.includes("Tamil Nadu")), true);
assert.equal(requestsForPeriod(pf, "2026-08").length, aug.length, "no extra documents for PF/ESI/PT");
// QRMP and Composition
const q = buildPlan({ ...xploro, gst: { registered: true, gstins: [{ id: "g1", gstin: "33AAAAA0000A1Z5", state: "Tamil Nadu", scheme: "qrmp" }, { id: "g2", gstin: "27AAAAA0000A1Z5", state: "Maharashtra", scheme: "composition" }] } }, data, today);
assert.equal(filingsForPeriod(q, "2026-08").filter((f) => f.filing_id === "F03").length, 1, "PMT-06 in month 1 of the quarter");
assert.equal(filingsForPeriod(q, "2026-09").filter((f) => ["F04", "F05", "F06"].includes(f.filing_id)).length, 3, "quarter-end GST returns");
assert.equal(filingsForPeriod(q, "2026-09").find((f) => f.filing_id === "F06")!.due, "2026-10-18", "CMP-08 on the 18th");
assert.equal(requestsForPeriod(q, "2026-08").filter((r) => r.rule_id === "R19").length, 1, "2B match only for the non-composition GSTIN");
// A redeemed issue adds only the documents the issue does not hold; a foreign investor adds three
const deb = buildPlan({ ...xploro, debentures: [{ id: "d1", type: "secured_ncd", issuedOn: "2024-01-01", status: "redeemed", redeemedOn: "2025-01-01" }], rounds: [{ id: "r1", round: "Seed", instrument: "ccps", foreign: true }] }, data, today);
assert.equal(deb.events.find((e) => e.kind === "deb")!.docs.length, 15);
assert.equal(deb.events.find((e) => e.kind === "debred")!.docs.length, 2, "2 new documents on redemption");
assert.equal(deb.events.find((e) => e.kind === "ccps")!.docs.length, 15 + 3, "CCPS 15 plus FEMA valuation, FC-GPR, FIRC");
console.log("ok - master engine: all assertions passed");
