import { INDIAN_STATES } from "@/lib/compliance";
import { currentFyStart } from "./engine";
import { checkId, type IdFormat } from "@/lib/idformats";
import type { Answers, Owner, Plan } from "./types";

// The conversation, step by step, exactly as the prototype asks it (12 — Prototype.html). Questions appear one at a time: a
// question is shown once the ones before it are answered. What an answer asks the company for is decided by the rules
// data and the engine, never here.

export type Opt = [value: string | boolean, label: string];
export type FieldDef = [path: string, label: string, kind?: "text" | "number" | "date" | "select", options?: readonly string[], fmt?: IdFormat];
export type ColDef = [key: string, label: string, kind: "text" | "date" | "select", weight: number, options?: readonly (string | Opt)[], fmt?: IdFormat];
type Common = { id: string; help?: string };
export type Q =
  | (Common & { kind: "choice"; ask: string; key: string; opts: Opt[] })
  | (Common & { kind: "multi"; ask: string; key: string; opts: string[] })
  | (Common & { kind: "date"; ask: string; key: string })
  | (Common & { kind: "month"; ask: string; key: string })
  | (Common & { kind: "note"; text: string })
  | (Common & { kind: "fields"; ask: string; fields: FieldDef[]; req: string[] })
  | (Common & { kind: "rows"; ask: string; list: string; cols: ColDef[]; blank: Record<string, string>; req: string[] })
  | (Common & { kind: "upload"; ask: string; key: string; owner: Owner; period?: string })
  | (Common & { kind: "docs"; ask: string; docs: { key: string; name: string; code: string | null; owner: Owner; na?: boolean }[]; ev: string });

export type StepDef = { t: string; s: string };
export const STEP_DEFS: StepDef[] = [
  { t: "Incorporation", s: "When and how the company was formed" }, { t: "Books", s: "Who keeps them and where" },
  { t: "Bank accounts", s: "One statement a month per account" }, { t: "GST", s: "Each GSTIN, its state and scheme" },
  { t: "Salaries", s: "People, payroll, PF, ESI" }, { t: "TDS", s: "What tax is deducted on" }, { t: "Revenue", s: "How the company earns" },
  { t: "Existing loans", s: "Every loan the company has today" }, { t: "Debentures", s: "Every issue, past or present" },
  { t: "Funding rounds", s: "Every round and its instrument" }, { t: "Investments held", s: "FDs, funds, shares, loans given" }, { t: "Review", s: "Check and finish" },
];

const yes: Opt[] = [[true, "Yes"], [false, "No"]];
const STATES = INDIAN_STATES as readonly string[];
export const INSTR: Record<string, string> = { equity: "Equity shares", ccps: "CCPS", ccd: "CCD", note: "Convertible note / iSAFE", ocps_ocd: "OCPS / OCD", grant: "Grant (non-dilutive)", venture_debt: "Venture debt" };
export const DEB_TYPES: Record<string, string> = { secured_ncd: "Secured NCD", unsecured_ncd: "Unsecured NCD", ccd: "CCD (convertible)", ocd: "OCD (optionally convertible)" };
const LOAN_TYPES = ["Term loan", "Working capital / CC / OD", "Vehicle or equipment loan", "Loan from director", "Loan from related company", "NBFC / fintech loan", "Other"];
const HOLD_TYPES: Opt[] = [["fd", "Fixed deposit"], ["mf", "Mutual fund"], ["shares", "Shares in another company"], ["odi", "Overseas investment (ODI)"], ["loan_given", "Loan given to another party"], ["other", "Other"]];
// Who the company's own papers belong to when a document in an event list is the founder's to supply (a signed agreement, a sanction letter...).
const FOUNDER_DOCS = new Set(["TERM", "SSA", "SHA", "CCPS_T", "CCD_A", "CNA", "VAL_RV", "VAL_FEMA", "REDEEM", "SANC", "LOAN", "FIRC", "DPIIT"]);

const get = (a: Answers, path: string): unknown => path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], a);
const fmtD = (s?: string) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const monLabel = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
export const lastEndedMonth = (today = new Date()) => { const d = new Date(today.getFullYear(), today.getMonth() - 1, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
export const isCompany = (a: Answers) => a.entity !== "llp" && a.entity !== "partnership";

export function catchNote(a: Answers, today = new Date()): string {
  if (!a.incorporatedOn) return "";
  const fy = currentFyStart(today);
  const from = a.trackingStart ?? (a.incorporatedOn.slice(0, 7) > fy ? a.incorporatedOn.slice(0, 7) : fy);
  const to = lastEndedMonth(today);
  const n = Math.max(0, (+to.slice(0, 4) - +from.slice(0, 4)) * 12 + (+to.slice(5) - +from.slice(5)) + 1);
  const old = a.incorporatedOn.slice(0, 7) < fy;
  return `${old ? `Incorporated ${fmtD(a.incorporatedOn)} — older than this financial year.` : `Incorporated ${fmtD(a.incorporatedOn)}, within this financial year.`} We'll collect <b>${n} catch-up month${n === 1 ? "" : "s"}</b> (${monLabel(from)} – ${monLabel(to)}), then every month from ${monLabel(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`)}. The data room timeline starts on ${fmtD(a.incorporatedOn)}.`;
}

export function defaultTracking(a: Answers, today = new Date()): string {
  const fy = currentFyStart(today);
  const inc = a.incorporatedOn?.slice(0, 7);
  return inc && inc > fy ? inc : fy;
}
export function trackingOptions(a: Answers, today = new Date()): string[] {
  if (!a.incorporatedOn) return [];
  const cur = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  let m = a.incorporatedOn.slice(0, 7);
  const floor = (() => { const d = new Date(today.getFullYear(), today.getMonth() - 24, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; })();
  if (m < floor) m = floor;
  const out: string[] = [];
  while (m <= cur) { out.push(m); const d = new Date(+m.slice(0, 4), +m.slice(5), 1); m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
  return out;
}

export type Ctx = { plan: Plan; closer: Owner; today?: Date; lib: Map<string, { name: string; form: string | null }> };

function evDocs(plan: Plan, ruleIds: string[], instanceFilter: (key: string) => boolean, ctx: Ctx): { key: string; name: string; code: string | null; owner: Owner; na?: boolean }[][] {
  return plan.events.filter((e) => ruleIds.includes(e.rule_id) && instanceFilter(e.key)).map((e) =>
    e.docs.filter((d) => !d.sharedWith).map((d) => ({
      key: `${e.key}:${d.code ?? d.name}`, name: d.name, code: d.code ? ctx.lib.get(d.code)?.form ?? null : null,
      owner: d.code && FOUNDER_DOCS.has(d.code) ? ("founder" as Owner) : ctx.closer, na: false,
    })),
  );
}

export function questionsFor(i: number, a: Answers, ctx: Ctx): Q[] {
  const ack = a.ack ?? {};
  const today = ctx.today ?? new Date();
  const closer = ctx.closer;
  const q: Q[] = [];
  const std = (rule: string) => ctx.plan.standard.filter((s) => s.rule_id === rule);
  const lastM = lastEndedMonth(today);

  switch (i) {
    case 0: {
      q.push({ id: "entity", kind: "choice", ask: "What kind of entity is this?", key: "entity", opts: [["private", "Private limited"], ["opc", "One person company"], ["public", "Public limited"], ["llp", "LLP"], ["section8", "Section 8 company"], ["partnership", "Partnership firm"]] });
      q.push({ id: "inc", kind: "date", ask: "When was the company incorporated?", key: "incorporatedOn", help: "Everything else is worked out from this date — what history we collect, and where the timeline starts." });
      if (a.incorporatedOn) {
        q.push({ id: "catch", kind: "note", text: catchNote({ ...a, trackingStart: a.trackingStart ?? defaultTracking(a, today) }, today) });
        q.push({ id: "track", kind: "month", ask: "Which month should monthly tracking start from?", key: "trackingStart", help: "Defaults to the start of this financial year. Founder, practitioner and Prime Bottomline can all change it later on the Monthly close page." });
      }
      q.push({ id: "ids", kind: "fields", ask: "A few details from the certificate", req: ["details.legalName", "details.pan", "details.state"], fields: [
        ["details.legalName", "Legal name"], ["details.cin", a.entity === "llp" ? "LLPIN" : isCompany(a) ? "CIN" : "Registration number", "text", undefined, a.entity === "llp" ? "llpin" : isCompany(a) ? "cin" : undefined], ["details.pan", "PAN", "text", undefined, "pan"],
        ["details.tan", "TAN (leave blank if none)", "text", undefined, "tan"], ["details.state", "Registered office state", "select", STATES]] });
      const coi = std("R01")[0] ?? std("R03")[0] ?? std("R05")[0];
      if (coi) q.push({ id: "up_coi", kind: "upload", ask: a.entity === "partnership" ? "Upload the partnership deed" : "Upload the certificate of incorporation", key: coi.key, owner: "founder" });
      const moa = std("R02")[0] ?? std("R04")[0];
      if (moa) q.push({ id: "up_moa", kind: "upload", ask: a.entity === "llp" ? "Upload the LLP agreement, with any amendments" : "Upload the Memorandum and Articles of Association", key: moa.key, owner: "founder", help: a.entity === "llp" ? undefined : "The current versions. Older ones go in the data room later." });
      const pan = std("R06")[0];
      if (pan) q.push({ id: "up_pan", kind: "upload", ask: "Upload the company PAN", key: pan.key, owner: "founder" });
      const tan = std("R07")[0];
      if (tan) q.push({ id: "up_tan", kind: "upload", ask: "Upload the TAN allotment letter", key: tan.key, owner: "founder" });
      const inc = ctx.plan.events.find((e) => e.kind === "incorp");
      if (inc && (ack.ids || a.details?.legalName)) {
        q.push({ id: "up_incdocs", kind: "docs", ask: "The rest of the incorporation papers, for the data room", help: "The certificate, PAN and TAN above count here too. Upload now, or press Later — they stay open on the timeline.", ev: "Incorporation",
          docs: inc.docs.filter((d) => !d.sharedWith).map((d) => ({ key: `${inc.key}:${d.code ?? d.name}`, name: d.name, code: d.code ? ctx.lib.get(d.code)?.form ?? null : null, owner: "founder" as Owner })) });
      }
      const fs = std("R08")[0];
      if (fs) q.push({ id: "up_fs", kind: "upload", ask: "The company is older than this financial year — upload the last audited financial statements", key: fs.key, owner: closer, help: `FY ${+currentFyStart(today).slice(0, 4) - 1}-${String(+currentFyStart(today).slice(0, 4)).slice(2)}. Our opening numbers start from these.` });
      break;
    }
    case 1: {
      q.push({ id: "software", kind: "choice", ask: "Where are the books kept?", key: "books.software", opts: ["Tally", "Zoho Books", "QuickBooks", "Busy", "Excel / sheets", "Other"].map((x) => [x, x] as Opt) });
      q.push({ id: "closer", kind: "choice", ask: "Who closes the books each month?", key: "books.closer", opts: [["firm", "Our auditor / accountant firm"], ["own", "Our own team"], ["pba", "Prime Bottomline"]] });
      if (a.books?.closer === "firm") q.push({ id: "hasExt", kind: "choice", ask: "Is that firm on the portal?", key: "books.firmOnPortal", opts: [[true, "Yes"], [false, "Not yet"]], help: "If not, their items go to the PBA practitioner until they join." });
      if (a.books?.closer === "firm" && a.books?.firmOnPortal) q.push({ id: "firm", kind: "fields", ask: "Name of the firm", req: ["books.firmName"], fields: [["books.firmName", "Firm name"]] });
      const otb = std("R11")[0];
      if (otb) q.push({ id: "up_tb", kind: "upload", ask: `Upload the opening trial balance for 1 April ${currentFyStart(today).slice(0, 4)}`, key: otb.key, owner: closer });
      break;
    }
    case 2: {
      q.push({ id: "banks", kind: "rows", ask: "List every bank account the company has", list: "banks", help: "Each account adds one statement request every month.", req: ["bank", "last4"], blank: { bank: "", type: "Current", last4: "" },
        cols: [["bank", "Bank", "text", 1.4], ["type", "Type", "select", 1, ["Current", "Savings", "OD / CC", "Escrow", "EEFC"]], ["last4", "Last 4 digits", "text", 0.8, undefined, "last4"]] });
      if (ack.banks) for (const b of a.banks ?? []) q.push({ id: `up_bank_${b.id}`, kind: "upload", ask: `Upload last month's statement — ${b.bank} ••${b.last4}`, key: `R16:${b.id}`, owner: "founder", period: lastM });
      break;
    }
    case 3: {
      q.push({ id: "gst", kind: "choice", ask: "Is the company registered for GST?", key: "gst.registered", opts: yes });
      if (a.gst?.registered) {
        q.push({ id: "gstins", kind: "rows", ask: "Add each GSTIN", list: "gst.gstins", help: "Regular files monthly. QRMP and Composition file quarterly. Composition claims no input credit.", req: ["gstin"], blank: { gstin: "", state: "Tamil Nadu", scheme: "regular" },
          cols: [["gstin", "GSTIN", "text", 1.6, undefined, "gstin"], ["state", "State", "select", 1, STATES], ["scheme", "Scheme", "select", 1, [["regular", "Regular"], ["qrmp", "QRMP"], ["composition", "Composition"]]]] });
        if (ack.gstins) for (const g of a.gst?.gstins ?? []) q.push({ id: `up_gst_${g.id}`, kind: "upload", ask: `Upload the GST registration certificate — ${g.gstin}`, key: `R17:${g.id}`, owner: "founder" });
      }
      break;
    }
    case 4: {
      q.push({ id: "salaries", kind: "choice", ask: "Does the company pay salaries?", key: "salaries.pays", opts: yes });
      if (a.salaries?.pays) {
        q.push({ id: "heads", kind: "fields", ask: "How many people does it pay?", req: ["salaries.employees"], fields: [["salaries.employees", "Employees on payroll", "number", undefined, "count"], ["salaries.contractors", "Contractors / consultants", "number"],
          ["salaries.payrollTool", "Payroll is run on", "select", ["Excel", "Zoho Payroll", "Keka", "greytHR", "RazorpayX Payroll", "Our accountant runs it", "Other"]]] });
        if (ack.heads) {
          const e = a.salaries?.employees ?? 0;
          q.push({ id: "pf", kind: "choice", ask: "Is the company registered for provident fund (PF)?", key: "salaries.pf", opts: yes, help: e >= 20 ? `With ${e} employees, PF registration is required.` : "Required from 20 employees, or if registered voluntarily." });
          q.push({ id: "esi", kind: "choice", ask: "Is it registered for ESI?", key: "salaries.esi", opts: yes, help: e >= 10 ? `With ${e} employees, ESI usually applies if anyone earns up to ₹21,000 a month.` : "Usually from 10 employees." });
          q.push({ id: "pt", kind: "multi", ask: "Which states is it registered for professional tax in?", key: "salaries.ptStates", help: "One challan a month per state.", opts: ["Tamil Nadu", "Karnataka", "Maharashtra", "Kerala", "Telangana", "West Bengal", "Gujarat", "Andhra Pradesh", "None"] });
          q.push({ id: "fsal", kind: "choice", ask: "Do the founders draw a salary?", key: "salaries.foundersPaid", opts: yes });
          q.push({ id: "up_pay", kind: "upload", ask: "Upload last month's payroll register", key: "R24", owner: "founder", period: lastM });
          const head = std("R23")[0];
          if (head) q.push({ id: "up_head", kind: "upload", ask: "Upload the current headcount list", key: head.key, owner: "founder" });
        }
      }
      break;
    }
    case 5:
      q.push({ id: "tds", kind: "multi", ask: "Does the company deduct tax on any of these payments?", key: "tds.types", opts: ["Salaries", "Vendors and professionals", "Rent", "Payments to non-residents", "None"],
        help: "Salaries → Form 138 (was 24Q until March 2026). Vendors and rent → was 26Q. Non-residents → was 27Q." });
      break;
    case 6: {
      q.push({ id: "rev", kind: "multi", ask: "How does the company earn?", key: "revenue.types", opts: ["Subscription", "Service", "Project", "Product sales", "Commission"] });
      q.push({ id: "partners", kind: "choice", ask: "Does it share revenue with partners, or pay commissions?", key: "revenue.partners", opts: yes });
      if (a.revenue?.partners) q.push({ id: "billing", kind: "choice", ask: "When revenue is shared, does the company…", key: "revenue.sharing", opts: [["full", "Bill the full amount and pay the partner"], ["own", "Bill only its own share"]], help: "This decides whether we report revenue gross or net. Asked once, here." });
      q.push({ id: "gw", kind: "multi", ask: "Which payment gateways does it collect through?", key: "revenue.gateways", opts: ["Razorpay", "Stripe", "Cashfree", "PayU", "None"] });
      q.push({ id: "adv", kind: "choice", ask: "Does it take advances from customers?", key: "revenue.advances", opts: yes });
      q.push({ id: "exp", kind: "choice", ask: "Does it bill clients outside India?", key: "revenue.exports", opts: yes });
      const cl = std("R35")[0]; if (cl) q.push({ id: "up_cl", kind: "upload", ask: "Upload the client list with billing terms", key: cl.key, owner: "founder" });
      const ra = std("R38")[0]; if (ra) q.push({ id: "up_ra", kind: "upload", ask: "Upload the revenue-share and commission agreements", key: ra.key, owner: "founder" });
      break;
    }
    case 7: {
      q.push({ id: "hasLoans", kind: "choice", ask: "Does the company have any loans today?", key: "has.loans", opts: yes, help: "Include loans from directors and related companies." });
      if (a.has?.loans) {
        q.push({ id: "loans", kind: "rows", ask: "Add each loan", list: "loans", req: ["lender"], blank: { lender: "", type: "Term loan", sanctioned: "", takenOn: "", secured: "yes" },
          cols: [["lender", "Lender", "text", 1.2], ["type", "Type", "select", 1.3, LOAN_TYPES], ["sanctioned", "Sanctioned ₹", "text", 1], ["takenOn", "Taken on", "date", 1], ["secured", "Secured", "select", 0.7, [["yes", "Yes"], ["no", "No"]]]] });
        if (ack.loans) {
          const per = evDocs(ctx.plan, ["R43"], () => true, ctx);
          (a.loans ?? []).forEach((l, k) => {
            const docs = (per[k] ?? []).map((d, n) => ({ ...d, na: l.secured === "no" && n >= 3 }));
            q.push({ id: `up_loan_${l.id}`, kind: "docs", ask: `Documents for the ${l.lender} loan`, ev: "Loan taken", docs,
              help: l.secured === "no" ? "Unsecured: security documents and the two charge items can be marked not applicable." : undefined });
          });
        }
      }
      break;
    }
    case 8: {
      q.push({ id: "hasDebs", kind: "choice", ask: "Has the company ever issued debentures?", key: "has.debentures", opts: yes });
      if (a.has?.debentures) {
        q.push({ id: "debs", kind: "rows", ask: "Add each debenture issue", list: "debentures", req: ["issuedOn", "amount"], blank: { issuedOn: "", type: "secured_ncd", amount: "", status: "outstanding", redeemedOn: "" },
          cols: [["issuedOn", "Issued on", "date", 1], ["type", "Type", "select", 1.3, Object.entries(DEB_TYPES)], ["amount", "Amount ₹", "text", 1], ["status", "Status", "select", 1, [["outstanding", "Outstanding"], ["redeemed", "Redeemed"]]], ["redeemedOn", "Redeemed on", "date", 1]] });
        if (ack.debs) (a.debentures ?? []).forEach((d) => {
          const issue = ctx.plan.events.find((e) => e.key === `R48:${d.id}`);
          const red = ctx.plan.events.find((e) => e.key === `R49:${d.id}`);
          const docs = [...(issue?.docs ?? []), ...(red?.docs ?? [])].filter((x) => !x.sharedWith).map((x) => ({
            key: `${(red && red.docs.includes(x) ? red : issue)!.key}:${x.code ?? x.name}`, name: x.name, code: x.code ? ctx.lib.get(x.code)?.form ?? null : null,
            owner: x.code && FOUNDER_DOCS.has(x.code) ? ("founder" as Owner) : closer }));
          q.push({ id: `up_deb_${d.id}`, kind: "docs", ask: `Documents for the ${DEB_TYPES[d.type] ?? d.type} issue of ${fmtD(d.issuedOn)}`, ev: d.type === "ccd" ? "CCD round" : "Debenture issue", docs });
        });
      }
      break;
    }
    case 9: {
      q.push({ id: "hasRounds", kind: "choice", ask: "Has the company raised money from investors?", key: "has.rounds", opts: yes });
      if (a.has?.rounds) {
        q.push({ id: "rounds", kind: "rows", ask: "Add each round", list: "rounds", help: "The instrument decides which documents we ask for.", req: ["closedOn", "amount"], blank: { round: "Seed", instrument: "ccps", closedOn: "", amount: "", foreign: "" },
          cols: [["round", "Round", "select", 1, ["Pre-seed", "Seed", "Bridge", "Pre-Series A", "Series A", "Series B", "Strategic", "Other"]], ["instrument", "Instrument", "select", 1.3, Object.entries(INSTR)], ["closedOn", "Closed on", "date", 1], ["amount", "Amount ₹", "text", 1], ["foreign", "Foreign investor?", "select", 0.8, [["", "No"], ["yes", "Yes"]]]] });
        if (ack.rounds) {
          (a.rounds ?? []).forEach((r) => {
            const ev = ctx.plan.events.find((e) => e.key === `R51:${r.id}` || e.key === `R53:${r.id}`);
            const docs = (ev?.docs ?? []).filter((x) => !x.sharedWith).map((x) => ({ key: `${ev!.key}:${x.code ?? x.name}`, name: x.name, code: x.code ? ctx.lib.get(x.code)?.form ?? null : null, owner: x.code && FOUNDER_DOCS.has(x.code) ? ("founder" as Owner) : closer }));
            q.push({ id: `up_r_${r.id}`, kind: "docs", ask: `Documents for the ${r.round} round — ${INSTR[r.instrument] ?? r.instrument}`, ev: r.instrument === "grant" ? "Grant" : INSTR[r.instrument] ?? "Round", docs });
          });
          const cap = std("R54")[0]; if (cap) q.push({ id: "up_cap", kind: "upload", ask: "Upload the current cap table", key: cap.key, owner: "founder" });
        }
      }
      break;
    }
    case 10: {
      q.push({ id: "hasHold", kind: "choice", ask: "Does the company hold investments, or has it lent money to anyone?", key: "has.investments", opts: yes });
      if (a.has?.investments) q.push({ id: "holdings", kind: "rows", ask: "Add each one", list: "investments", req: ["heldWith"], blank: { what: "fd", heldWith: "", amount: "" },
        cols: [["what", "What", "select", 1.4, HOLD_TYPES], ["heldWith", "Held with", "text", 1.4], ["amount", "Amount ₹", "text", 1]] });
      break;
    }
  }
  return q;
}

// What is wrong with the government IDs and counts typed in a question, by field, in plain words.
export function fieldErrors(fields: FieldDef[], a: Answers): { path: string; msg: string }[] {
  const out: { path: string; msg: string }[] = [];
  for (const [path, , , , fmt] of fields) if (fmt) { const m = checkId(fmt, String(get(a, path) ?? ""), a); if (m) out.push({ path, msg: m }); }
  return out;
}
export function rowErrors(cols: ColDef[], row: Record<string, unknown>, a: Answers): { key: string; msg: string }[] {
  const out: { key: string; msg: string }[] = [];
  for (const [key, , , , , fmt] of cols) if (fmt) { const m = checkId(fmt, String(row[key] ?? ""), a, row); if (m) out.push({ key, msg: m }); }
  return out;
}

export function isAnswered(q: Q, a: Answers, has: (key: string, period?: string) => boolean): boolean {
  const ack = a.ack ?? {};
  if (q.kind === "note") return true;
  if (q.kind === "choice" || q.kind === "date") { const v = get(a, q.key); return v !== undefined && v !== null && v !== "" && !!ack[q.id]; }
  if (q.kind === "month") return !!a.trackingStart && !!ack[q.id];
  if (q.kind === "multi") { const v = get(a, q.key); return Array.isArray(v) && v.length > 0 && !!ack[q.id]; }
  if (q.kind === "fields") return !!ack[q.id] && q.req.every((p) => String(get(a, p) ?? "").trim()) && fieldErrors(q.fields, a).length === 0;
  if (q.kind === "rows") { const v = get(a, q.list); return !!ack[q.id] && Array.isArray(v) && v.length > 0 && (v as Record<string, unknown>[]).every((r) => q.req.every((k) => String(r[k] ?? "").trim()) && rowErrors(q.cols, r, a).length === 0); }
  if (q.kind === "upload") return has(q.key, q.period) || !!a.later?.[q.key];
  return q.docs.every((d) => has(d.key) || !!a.later?.[d.key] || !!a.na?.[d.key]);
}

export function visibleQuestions(i: number, a: Answers, ctx: Ctx, has: (key: string, period?: string) => boolean) {
  const all = questionsFor(i, a, ctx);
  const out: Q[] = [];
  for (const q of all) { out.push(q); if (!isAnswered(q, a, has)) break; }
  return { all, out };
}
export const stepComplete = (i: number, a: Answers, ctx: Ctx, has: (key: string, period?: string) => boolean) => questionsFor(i, a, ctx).every((q) => isAnswered(q, a, has));
export const valueAt = get;
