import assert from "node:assert/strict";
import { generateObligations, resolveItrBasis, type Rule, type Registration, type Setting } from "../lib/compliance";

const Q = { "1": "07-31", "2": "10-31", "3": "01-31", "4": "05-31" };
const rules: Rule[] = [
  { code: "gstr1", service: "GST", name: "GSTR-1", category: "GST", registration_kind: "gst", frequency: "monthly", due_rule: { day: 11, months_after: 1 }, applies_when: { filing_type: "regular" }, owner_default: "practitioner", sort: 10 },
  { code: "gstr3b", service: "GST", name: "GSTR-3B", category: "GST", registration_kind: "gst", frequency: "monthly", due_rule: { day: 20, months_after: 1 }, applies_when: { filing_type: "regular" }, owner_default: "practitioner", sort: 20 },
  { code: "gstr9", service: "GST", name: "GSTR-9", category: "GST", registration_kind: "gst", frequency: "yearly", due_rule: { mmdd: "12-31", years_after_fy_start: 1 }, applies_when: { filing_type: "regular" }, owner_default: "practitioner", sort: 30 },
  { code: "tds_payment", service: "TDS", name: "TDS payment", category: "TDS", registration_kind: "tan", frequency: "monthly", due_rule: { day: 7, months_after: 1 }, applies_when: {}, owner_default: "practitioner", sort: 10 },
  { code: "tds_26q", service: "TDS", name: "TDS return 26Q", category: "TDS", registration_kind: "tan", frequency: "quarterly", due_rule: { by_quarter: Q }, applies_when: { form: "26Q" }, owner_default: "practitioner", sort: 30 },
  { code: "itr_nonaudit", service: "ITR", name: "ITR (non-audit)", category: "ITR", registration_kind: "entity", frequency: "yearly", due_rule: { mmdd: "07-31", years_after_fy_start: 1 }, applies_when: { itr_basis: "non_audit" }, owner_default: "practitioner", sort: 10 },
  { code: "itr_audit", service: "ITR", name: "ITR (audit)", category: "ITR", registration_kind: "entity", frequency: "yearly", due_rule: { mmdd: "10-31", years_after_fy_start: 1 }, applies_when: { itr_basis: "audit" }, owner_default: "practitioner", sort: 20 },
];
const gst: Registration = { id: "g1", kind: "gst", identifier: "29ABCDE1234F1Z5", state: "Karnataka", filing_type: "regular", forms: [], status: "active" };
const tan: Registration = { id: "t1", kind: "tan", identifier: "BLRA12345B", state: null, filing_type: null, forms: ["26Q"], status: "active" };
const ent: Registration = { id: "e1", kind: "entity", identifier: "ENTITY", state: null, filing_type: null, forms: [], status: "active" };
const today = new Date(Date.UTC(2026, 9, 19)); // 19 Oct 2026 -> FY 2026-27
const setting: Setting = { entity_type: "Private Limited", effective_from: null, start_fy: 2026, itr_basis: "auto" };

const rows = generateObligations(rules, [gst, tan, ent], setting, today);
const find = (code: string, period: string) => rows.find((r) => r.rule_code === code && r.period === period);

// GST: monthly, 11th / 20th of the next month; yearly GSTR-9 on 31 Dec of the next year (FY 2026-27 -> 31 Dec 2027)
assert.equal(find("gstr1", "2026-04")?.statutory_due_date, "2026-05-11");
assert.equal(find("gstr3b", "2026-04")?.statutory_due_date, "2026-05-20");
assert.equal(find("gstr1", "2027-03")?.statutory_due_date, "2027-04-11");   // March rolls into April
assert.equal(find("gstr3b", "2026-12")?.statutory_due_date, "2027-01-20");  // December rolls into the next year
assert.equal(find("gstr9", "2027-03")?.statutory_due_date, "2027-12-31");
assert.equal(rows.filter((r) => r.rule_code === "gstr1").length, 12);
// TDS: payment on the 7th; 26Q quarterly with the fixed due dates
assert.equal(find("tds_payment", "2026-04")?.statutory_due_date, "2026-05-07");
assert.equal(find("tds_26q", "2026-06")?.statutory_due_date, "2026-07-31"); // Q1
assert.equal(find("tds_26q", "2026-09")?.statutory_due_date, "2026-10-31"); // Q2
assert.equal(find("tds_26q", "2026-12")?.statutory_due_date, "2027-01-31"); // Q3 falls in the next calendar year
assert.equal(find("tds_26q", "2027-03")?.statutory_due_date, "2027-05-31"); // Q4
assert.equal(rows.filter((r) => r.rule_code === "tds_26q").length, 4);
// ITR: a Private Limited is treated as audited under "auto" -> 31 Oct 2027; an LLP -> 31 Jul 2027
assert.equal(find("itr_audit", "2027-03")?.statutory_due_date, "2027-10-31");
assert.equal(find("itr_nonaudit", "2027-03"), undefined);
assert.equal(resolveItrBasis({ itr_basis: "auto", entity_type: "LLP" }), "non_audit");
const llp = generateObligations(rules, [ent], { ...setting, entity_type: "LLP" }, today);
assert.equal(llp.find((r) => r.rule_code === "itr_nonaudit")?.statutory_due_date, "2027-07-31");
// Filing types that have no rules yet generate nothing (the app refuses to save them with a message)
const qrmp = generateObligations(rules, [{ ...gst, filing_type: "qrmp" }], setting, today);
assert.equal(qrmp.length, 0);
// Effective-from: periods ending before it are not generated
const late = generateObligations(rules, [gst], { ...setting, effective_from: "2026-07-15" }, today);
assert.equal(late.some((r) => r.rule_code === "gstr1" && r.period === "2026-06"), false);
assert.equal(late.some((r) => r.rule_code === "gstr1" && r.period === "2026-07"), true);
// Start-tracking year: an earlier start brings in history; FYs run only up to the current one
const hist = generateObligations(rules, [gst], { ...setting, start_fy: 2024 }, today);
assert.equal(hist.filter((r) => r.rule_code === "gstr1").length, 36);
// Saving twice cannot duplicate: every row has a unique (rule, registration, period)
const keys = new Set(rows.map((r) => `${r.rule_code}|${r.registration_id}|${r.period}`));
assert.equal(keys.size, rows.length);
// A closed registration generates nothing
assert.equal(generateObligations(rules, [{ ...gst, status: "closed" }], setting, today).length, 0);
// Names say which registration and period
assert.equal(find("gstr1", "2026-04")?.name, "GSTR-1 · 29ABCDE1234F1Z5 (Karnataka) · Apr 2026");
assert.equal(find("tds_26q", "2026-06")?.name, "TDS return 26Q · BLRA12345B · Q1 FY27");
// Team: a service's default owner overrides the rule's own
const teamRows = generateObligations(rules, [gst], setting, today, { GST: "founder" });
assert.equal(teamRows.every((r) => r.owner === "founder"), true);
assert.equal(generateObligations(rules, [gst, tan], setting, today, { GST: "pba" }).find((r) => r.rule_code === "tds_payment")?.owner, "practitioner");
// Custom types: bound to their own registration, so two custom types never cross
const custom: Rule[] = [
  { code: "custom_c1", service: "Custom", name: "Fire NOC", category: "Custom", registration_kind: "custom", frequency: "yearly", due_rule: { mmdd: "02-15", years_after_fy_start: 1 }, applies_when: {}, owner_default: "practitioner", sort: 0 },
  { code: "custom_c2", service: "Custom", name: "Monthly return", category: "Custom", registration_kind: "custom", frequency: "monthly", due_rule: { day: 5, months_after: 1 }, applies_when: {}, owner_default: "practitioner", sort: 0 },
];
const regC1: Registration = { id: "c1", kind: "custom", identifier: "Fire NOC", state: null, filing_type: null, forms: [], status: "active" };
const regC2: Registration = { id: "c2", kind: "custom", identifier: "Monthly return", state: null, filing_type: null, forms: [], status: "active" };
const cRows = generateObligations(custom, [regC1, regC2], setting, today);
assert.equal(cRows.filter((r) => r.rule_code === "custom_c1").length, 1);
assert.equal(cRows.filter((r) => r.rule_code === "custom_c2").length, 12);
assert.equal(cRows.find((r) => r.rule_code === "custom_c1")?.statutory_due_date, "2027-02-15");
assert.equal(cRows.find((r) => r.rule_code === "custom_c1")?.name, "Fire NOC · FY 2026-27");
console.log(`ok - ${rows.length} rows for FY 2026-27; all assertions passed`);
