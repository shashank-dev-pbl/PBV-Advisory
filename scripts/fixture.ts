import { readFileSync } from "node:fs";
import type { EngineData } from "../lib/master/engine";
import type { Answers } from "../lib/master/types";

// The data the portal loads from the database, here read from the same files the seed is built from.
const json = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const csv = (p: string) => readFileSync(p, "utf8").replace(/^﻿/, "").trim().split(/\r?\n/).slice(1).map((l) => {
  const out: string[] = []; let cur = "", q = false;
  for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch; }
  out.push(cur); return out;
});
export const data: EngineData = {
  rules: json("data/master/rules.json"),
  filings: json("data/master/filings.json"),
  eventDocs: csv("data/b4/03-event-document-list.csv").filter((r) => r[4]).map((r) => ({ event_type: r[0], doc_code: r[4], need: r[3] === "expected" ? "expected" : "if_applies", condition_note: r[7] || null })),
  library: csv("data/b4/04-document-library.csv").map((r) => ({ code: r[0], name: r[1], form: r[2] || null })),
};
// Xploro, as in 11 — What Each Step Adds
export const xploro: Answers = {
  entity: "private", incorporatedOn: "2023-06-12", trackingStart: "2026-04",
  details: { legalName: "Xploro", pan: "AAAAA0000A", tan: "BLRX00000X", state: "Tamil Nadu" },
  books: { software: "Tally", closer: "firm", firmOnPortal: true, firmName: "SPARC & Co" },
  banks: [{ id: "b1", bank: "HDFC", type: "Current", last4: "1234" }],
  gst: { registered: true, gstins: [{ id: "g1", gstin: "33AAAAA0000A1Z9", state: "Tamil Nadu", scheme: "regular" }] },
  salaries: { pays: true, employees: 14, contractors: 5, pf: false, esi: false, ptStates: [], foundersPaid: true },
  tds: { types: ["salaries", "vendors"] },
  revenue: { types: ["subscription", "service"], partners: true, sharing: "full", gateways: ["Razorpay", "PayU"], advances: false, exports: true },
  loans: [{ id: "l1", lender: "HDFC", type: "Term loan", secured: false, takenOn: "2024-03-01" }],
  debentures: [],
  rounds: [{ id: "r1", round: "Bridge", instrument: "ccd", closedOn: "2025-09-01", amount: 1000000, foreign: false }],
  investments: [],
};
