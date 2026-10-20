import { INDIAN_STATES } from "@/lib/compliance";
import type { Answers } from "./types";

// The twelve steps of the company master and every question in them (03 — Company Master Spec). This is the screen's
// shape; what each answer asks the company for lives in the rules data (04, 05), never here.

export type Opt = { value: string | boolean; label: string };
export type Field = { key: string; label: string; kind?: "text" | "number" | "date" | "select" | "yesno"; options?: string[]; required?: boolean; placeholder?: string };
type Base = { id: string; label: string; help?: string; showIf?: (a: Answers) => boolean };
export type Question =
  | (Base & { type: "choice"; path: string; options: Opt[] })
  | (Base & { type: "multi"; path: string; options: Opt[]; none?: string })
  | (Base & { type: "date"; path: string })
  | (Base & { type: "month"; path: string })
  | (Base & { type: "fields"; path: string; fields: Field[] })
  | (Base & { type: "rows"; path: string; noun: string; columns: Field[]; min?: number })
  | (Base & { type: "upload"; rules: string[] })                       // one document per matching standard request
  | (Base & { type: "docs"; rules: string[] });                        // a list of documents for each matching timeline event
export type Step = { n: number; title: string; blurb: string; questions: Question[] };

const yes: Opt[] = [{ value: true, label: "Yes" }, { value: false, label: "No" }];
const get = (a: Answers, path: string): unknown => path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], a);
const closer = (a: Answers) => a.books?.closer;
const pays = (a: Answers) => a.salaries?.pays === true;
const has = (k: keyof NonNullable<Answers["has"]>) => (a: Answers) => a.has?.[k] === true;
const states = INDIAN_STATES as readonly string[];

export const STEPS: Step[] = [
  { n: 1, title: "Incorporation", blurb: "What the company is and when it began. Most of the rest follows from this.", questions: [
    { id: "entity", type: "choice", label: "What kind of entity is this?", path: "entity", options: [
      { value: "private", label: "Private limited" }, { value: "opc", label: "One person company" }, { value: "public", label: "Public limited" },
      { value: "llp", label: "LLP" }, { value: "section8", label: "Section 8 company" }, { value: "partnership", label: "Partnership firm" }] },
    { id: "incorporatedOn", type: "date", label: "When was the company incorporated?", path: "incorporatedOn", help: "Everything else is worked out from this date." },
    { id: "trackingStart", type: "month", label: "Which month should monthly tracking start from?", path: "trackingStart", help: "Usually the start of this financial year, or the month the company began if that is later." },
    { id: "details", type: "fields", label: "Details from the certificate", path: "details", fields: [
      { key: "legalName", label: "Legal name", required: true }, { key: "cin", label: "CIN (LLPIN for an LLP, registration number for a firm)" },
      { key: "pan", label: "PAN", required: true }, { key: "tan", label: "TAN (optional)" },
      { key: "state", label: "Registered office state", kind: "select", options: [...states], required: true }] },
    { id: "up-coi", type: "upload", label: "Certificate of incorporation", rules: ["R01", "R03", "R05"], help: "Partnership deed for a firm." },
    { id: "up-moa", type: "upload", label: "MOA and AOA", rules: ["R02", "R04"], help: "LLP agreement for an LLP." },
    { id: "up-pan", type: "upload", label: "Company PAN", rules: ["R06"] },
    { id: "up-tan", type: "upload", label: "TAN allotment letter", rules: ["R07"], help: "Only if a TAN was given." },
    { id: "docs-incorp", type: "docs", label: "The rest of the incorporation papers", rules: ["R10"], help: "Upload now or Later. Asked of every company, however old." },
    { id: "up-afs", type: "upload", label: "Last audited financial statements", rules: ["R08"], help: "Only for a company older than this financial year." },
  ] },
  { n: 2, title: "Books", blurb: "Who keeps the books decides who is asked for books, the MIS and filings.", questions: [
    { id: "software", type: "choice", label: "Where are the books kept?", path: "books.software", options: ["Tally", "Zoho Books", "QuickBooks", "Busy", "Excel / sheets", "Other"].map((v) => ({ value: v, label: v })) },
    { id: "closer", type: "choice", label: "Who closes the books each month?", path: "books.closer", options: [
      { value: "firm", label: "Our auditor / accountant firm" }, { value: "own", label: "Our own team" }, { value: "pba", label: "Prime Bottomline" }] },
    { id: "firmOnPortal", type: "choice", label: "Is that firm on the portal?", path: "books.firmOnPortal", options: yes, showIf: (a) => closer(a) === "firm",
      help: "If not yet, their items go to the PBA practitioner until they join." },
    { id: "firmName", type: "fields", label: "Name of the firm", path: "books", fields: [{ key: "firmName", label: "Firm name", required: true }], showIf: (a) => closer(a) === "firm", help: "Shown on everything they upload." },
    { id: "up-otb", type: "upload", label: "Opening trial balance for 1 April", rules: ["R11"] },
  ] },
  { n: 3, title: "Bank accounts", blurb: "Each account adds one statement every month.", questions: [
    { id: "banks", type: "rows", label: "List every bank account", path: "banks", noun: "account", min: 1, columns: [
      { key: "bank", label: "Bank", required: true },
      { key: "type", label: "Type", kind: "select", options: ["Current", "Savings", "OD / CC", "Escrow", "EEFC"], required: true },
      { key: "last4", label: "Last 4 digits", required: true, placeholder: "1234" }] },
  ] },
  { n: 4, title: "GST", blurb: "Each GSTIN adds its registers, returns and certificate.", questions: [
    { id: "gstReg", type: "choice", label: "Is the company registered for GST?", path: "gst.registered", options: yes },
    { id: "gstins", type: "rows", label: "Add each GSTIN", path: "gst.gstins", noun: "GSTIN", min: 1, showIf: (a) => a.gst?.registered === true,
      help: "Regular files monthly. QRMP and Composition file quarterly; Composition claims no input credit.", columns: [
      { key: "gstin", label: "GSTIN", required: true, placeholder: "33AAAAA0000A1Z5" },
      { key: "state", label: "State", kind: "select", options: [...states], required: true },
      { key: "scheme", label: "Scheme", kind: "select", options: ["regular", "qrmp", "composition"], required: true }] },
    { id: "up-gst", type: "upload", label: "GST registration certificate", rules: ["R17"], help: "One per GSTIN." },
  ] },
  { n: 5, title: "Salaries", blurb: "Payroll, PF, ESI and professional tax become monthly items and filings.", questions: [
    { id: "pays", type: "choice", label: "Does the company pay salaries?", path: "salaries.pays", options: yes },
    { id: "people", type: "fields", label: "How many people does it pay?", path: "salaries", showIf: pays, fields: [
      { key: "employees", label: "Employees on payroll", kind: "number", required: true },
      { key: "contractors", label: "Contractors / consultants", kind: "number" },
      { key: "payrollTool", label: "Payroll is run on", kind: "select", options: ["Excel", "Zoho Payroll", "Keka", "greytHR", "RazorpayX Payroll", "Our accountant runs it", "Other"] }] },
    { id: "pf", type: "choice", label: "Is the company registered for PF?", path: "salaries.pf", options: yes, showIf: pays, help: "Required from 20 employees." },
    { id: "esi", type: "choice", label: "Is it registered for ESI?", path: "salaries.esi", options: yes, showIf: pays, help: "Usually from 10 employees, where anyone earns up to ₹21,000 a month." },
    { id: "pt", type: "multi", label: "Which states is it registered for professional tax in?", path: "salaries.ptStates", showIf: pays, none: "None",
      options: [...states.map((s) => ({ value: s, label: s })), { value: "None", label: "None" }] },
    { id: "founders", type: "choice", label: "Do the founders draw a salary?", path: "salaries.foundersPaid", options: yes, showIf: pays },
    { id: "up-head", type: "upload", label: "Current headcount list", rules: ["R23"] },
  ] },
  { n: 6, title: "TDS", blurb: "Tax deducted becomes a payment every month and returns every quarter.", questions: [
    { id: "tds", type: "multi", label: "Does the company deduct tax on any of these?", path: "tds.types", none: "none", help: "From April 2026 the salary return is Form 138 under the new Income-tax Act.", options: [
      { value: "salaries", label: "Salaries" }, { value: "vendors", label: "Vendors and professionals" }, { value: "rent", label: "Rent" },
      { value: "nonresident", label: "Payments to non-residents" }, { value: "none", label: "None" }] },
  ] },
  { n: 7, title: "Revenue", blurb: "How the company earns decides collections, ageing and what is reported gross or net.", questions: [
    { id: "rtypes", type: "multi", label: "How does the company earn?", path: "revenue.types", options: ["Subscription", "Service", "Project", "Product sales", "Commission"].map((v) => ({ value: v, label: v })) },
    { id: "partners", type: "choice", label: "Does it share revenue with partners, or pay commissions?", path: "revenue.partners", options: yes },
    { id: "sharing", type: "choice", label: "When revenue is shared, does the company…", path: "revenue.sharing", showIf: (a) => a.revenue?.partners === true,
      help: "Decides gross versus net reporting. Asked once, here.", options: [{ value: "full", label: "Bill the full amount and pay the partner" }, { value: "own", label: "Bill only its own share" }] },
    { id: "gateways", type: "multi", label: "Which payment gateways does it collect through?", path: "revenue.gateways", none: "None",
      options: ["Razorpay", "Stripe", "Cashfree", "PayU", "None"].map((v) => ({ value: v, label: v })) },
    { id: "advances", type: "choice", label: "Does it take advances from customers?", path: "revenue.advances", options: yes },
    { id: "exports", type: "choice", label: "Does it bill clients outside India?", path: "revenue.exports", options: yes },
    { id: "up-cl", type: "upload", label: "Client list with billing terms", rules: ["R35"] },
    { id: "up-rsa", type: "upload", label: "Revenue-share and commission agreements", rules: ["R38"], help: "Only if partners = yes." },
  ] },
  { n: 8, title: "Existing loans", blurb: "Each loan becomes a timeline event and a monthly statement.", questions: [
    { id: "hasLoans", type: "choice", label: "Does the company have any loans today?", path: "has.loans", options: yes, help: "Include loans from directors and related companies." },
    { id: "loans", type: "rows", label: "Add each loan", path: "loans", noun: "loan", min: 1, showIf: has("loans"), columns: [
      { key: "lender", label: "Lender", required: true },
      { key: "type", label: "Type", kind: "select", options: ["Term loan", "Working capital / CC / OD", "Vehicle or equipment", "Loan from director", "Loan from related company", "NBFC / fintech", "Other"], required: true },
      { key: "sanctioned", label: "Sanctioned ₹", kind: "number" }, { key: "takenOn", label: "Taken on", kind: "date" }, { key: "secured", label: "Secured?", kind: "yesno" }] },
    { id: "docs-loans", type: "docs", label: "Documents for each loan", rules: ["R43"], help: "For an unsecured loan the last three can be marked Not applicable." },
  ] },
  { n: 9, title: "Debentures", blurb: "Each issue becomes a timeline event.", questions: [
    { id: "hasDeb", type: "choice", label: "Has the company ever issued debentures?", path: "has.debentures", options: yes },
    { id: "debs", type: "rows", label: "Add each issue", path: "debentures", noun: "issue", min: 1, showIf: has("debentures"), columns: [
      { key: "issuedOn", label: "Issued on", kind: "date" },
      { key: "type", label: "Type", kind: "select", options: ["secured_ncd", "unsecured_ncd", "ccd", "ocd"], required: true },
      { key: "amount", label: "Amount ₹", kind: "number" },
      { key: "status", label: "Status", kind: "select", options: ["outstanding", "redeemed"], required: true },
      { key: "redeemedOn", label: "Redeemed on", kind: "date" }] },
    { id: "docs-debs", type: "docs", label: "Documents for each issue", rules: ["R48", "R49"], help: "A redeemed issue adds the redemption documents." },
  ] },
  { n: 10, title: "Funding rounds", blurb: "The instrument decides the documents.", questions: [
    { id: "hasRounds", type: "choice", label: "Has the company raised money from investors?", path: "has.rounds", options: yes },
    { id: "rounds", type: "rows", label: "Add each round", path: "rounds", noun: "round", min: 1, showIf: has("rounds"), columns: [
      { key: "round", label: "Round", kind: "select", options: ["Pre-seed", "Seed", "Bridge", "Pre-Series A", "Series A", "Series B", "Strategic", "Other"], required: true },
      { key: "instrument", label: "Instrument", kind: "select", options: ["equity", "ccps", "ccd", "ocps_ocd", "note", "grant", "venture_debt"], required: true },
      { key: "closedOn", label: "Closed on", kind: "date" }, { key: "amount", label: "Amount ₹", kind: "number" }, { key: "foreign", label: "Foreign investor?", kind: "yesno" }] },
    { id: "docs-rounds", type: "docs", label: "Documents for each round", rules: ["R51", "R53"], help: "A foreign investor adds the FEMA valuation, FC-GPR and FIRC." },
    { id: "up-cap", type: "upload", label: "Current cap table", rules: ["R54"] },
  ] },
  { n: 11, title: "Investments held", blurb: "Fixed deposits and funds ask for a monthly statement.", questions: [
    { id: "hasInv", type: "choice", label: "Does the company hold investments, or has it lent money to anyone?", path: "has.investments", options: yes },
    { id: "invs", type: "rows", label: "Add each one", path: "investments", noun: "holding", min: 1, showIf: has("investments"), columns: [
      { key: "what", label: "What", kind: "select", options: ["fd", "mf", "shares", "odi", "loan_given", "other"], required: true },
      { key: "heldWith", label: "Held with" }, { key: "amount", label: "Amount ₹", kind: "number" }] },
  ] },
  { n: 12, title: "Review", blurb: "Every answer on one page. Finish marks the master complete.", questions: [] },
];

export const valueAt = get;

// A question counts as answered once there is a value for it (a "No" is an answer).
export function answered(q: Question, a: Answers): boolean {
  if (q.type === "upload" || q.type === "docs") return true;
  const v = get(a, "path" in q ? q.path : "");
  if (q.type === "rows") return Array.isArray(v) && v.length >= (q.min ?? 1);
  if (q.type === "multi") return Array.isArray(v) && v.length > 0;
  if (q.type === "fields") {
    const o = (v ?? {}) as Record<string, unknown>;
    return q.fields.every((f) => !f.required || (o[f.key] !== undefined && o[f.key] !== "" && o[f.key] !== null));
  }
  return v !== undefined && v !== null && v !== "";
}
export const visibleQuestions = (step: Step, a: Answers) => step.questions.filter((q) => !q.showIf || q.showIf(a));
