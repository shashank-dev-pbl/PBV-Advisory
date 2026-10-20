import type {
  Answers, EventDocReq, EventTypeDoc, FilingDef, FilingRow, LibDoc, MasterFiling, MasterRule, Owner, Plan, Recurring, Request, StdDoc, Tier, TimelineEvent,
} from "./types";

// The rules engine. It turns the master's answers into what the company is asked for, using the rules and the
// filing calendar loaded from the database (04, 05). Nothing here lists a document: a request exists only if a
// rule created it, so a blank master asks for nothing.

type Instance = Record<string, unknown> | string | undefined;
const COMPANY = new Set(["private", "opc", "public", "section8"]);
const HALF_YEARLY_PT = new Set(["Tamil Nadu", "Kerala"]);
const QUARTER_END = new Set(["06", "09", "12", "03"]);
const pad = (n: number) => String(n).padStart(2, "0");

export function currentFyStart(today: Date): string {
  const y = today.getUTCMonth() >= 3 ? today.getUTCFullYear() : today.getUTCFullYear() - 1;
  return `${y}-04`;
}

// The condition vocabulary: the one thing in code. Each key answers "does this apply?" from the answers and,
// for rules that repeat, from the one row (bank, GSTIN, loan...) being considered.
const CONDITIONS: Record<string, (a: Answers, i: Instance, today: Date) => boolean> = {
  always: () => true,
  catchup: () => false,
  "entity.company": (a) => !!a.entity && COMPANY.has(a.entity),
  "entity.llp": (a) => a.entity === "llp",
  "entity.partnership": (a) => a.entity === "partnership",
  "tan.given": (a) => !!a.details?.tan?.trim(),
  "older.thisFy": (a, _i, today) => !!a.incorporatedOn && a.incorporatedOn.slice(0, 7) < currentFyStart(today),
  "books.firmOrTeam": (a) => a.books?.closer === "firm" || a.books?.closer === "own",
  "gstin.notComposition": (_a, i) => (i as { scheme?: string } | undefined)?.scheme !== "composition",
  "gstin.regular": (_a, i) => (i as { scheme?: string } | undefined)?.scheme === "regular",
  "gstin.qrmp": (_a, i) => (i as { scheme?: string } | undefined)?.scheme === "qrmp",
  "gstin.composition": (_a, i) => (i as { scheme?: string } | undefined)?.scheme === "composition",
  "gstin.quarterly": (_a, i) => ["qrmp", "composition"].includes((i as { scheme?: string } | undefined)?.scheme ?? ""),
  "salaries.pays": (a) => !!a.salaries?.pays,
  "pf.yes": (a) => !!a.salaries?.pays && !!a.salaries?.pf,
  "esi.yes": (a) => !!a.salaries?.pays && !!a.salaries?.esi,
  "pt.any": (a) => !!a.salaries?.pays && (a.salaries?.ptStates?.length ?? 0) > 0,
  "pt.monthlyState": (_a, i) => typeof i === "string" && !HALF_YEARLY_PT.has(i),
  "pt.halfYearlyState": (_a, i) => typeof i === "string" && HALF_YEARLY_PT.has(i),
  "founders.paid": (a) => !!a.salaries?.pays && !!a.salaries?.foundersPaid,
  "contractors.some": (a) => (a.salaries?.contractors ?? 0) > 0,
  "tds.any": (a) => (a.tds?.types?.length ?? 0) > 0,
  "tds.salaries": (a) => !!a.tds?.types?.includes("salaries"),
  "tds.vendorsOrRent": (a) => !!a.tds?.types?.some((t) => t === "vendors" || t === "rent"),
  "tds.nonresident": (a) => !!a.tds?.types?.includes("nonresident"),
  "partners.yes": (a) => !!a.revenue?.partners,
  "gateway.some": (a) => (a.revenue?.gateways?.length ?? 0) > 0,
  "advances.yes": (a) => !!a.revenue?.advances,
  "exports.yes": (a) => !!a.revenue?.exports,
  "loan.some": (a) => (a.loans?.length ?? 0) > 0,
  "issue.some": (a) => (a.debentures?.length ?? 0) > 0,
  "issue.redeemed": (_a, i) => (i as { status?: string } | undefined)?.status === "redeemed",
  "issue.outstanding": (_a, i) => (i as { status?: string } | undefined)?.status === "outstanding",
  "round.some": (a) => (a.rounds?.length ?? 0) > 0,
  "round.foreign": (_a, i) => !!(i as { foreign?: boolean } | undefined)?.foreign,
  "round.grant": (_a, i) => (i as { instrument?: string } | undefined)?.instrument === "grant",
  "holding.fdOrFund": (_a, i) => ["fd", "mf"].includes((i as { what?: string } | undefined)?.what ?? ""),
  "holding.other": (_a, i) => !!(i as { what?: string } | undefined)?.what && !["fd", "mf"].includes((i as { what?: string }).what!),
};
export const conditionKeys = () => Object.keys(CONDITIONS);

function instancesOf(by: string | null, a: Answers): Instance[] {
  switch (by) {
    case "bank": return a.banks ?? [];
    case "gstin": return a.gst?.registered === false ? [] : a.gst?.gstins ?? [];
    case "state": return a.salaries?.pays ? a.salaries?.ptStates ?? [] : [];
    case "gateway": return a.revenue?.gateways ?? [];
    case "loan": return a.loans ?? [];
    case "issue": return a.debentures ?? [];
    case "round": return a.rounds ?? [];
    case "holding": return a.investments ?? [];
    default: return [undefined];
  }
}

const LABEL: Record<string, (i: Instance) => string> = {
  bank: (i) => { const b = i as { bank: string; last4: string }; return `${b.bank} ••${b.last4}`; },
  gstin: (i) => (i as { gstin: string }).gstin,
  state: (i) => String(i),
  gateway: (i) => String(i),
  loan: (i) => (i as { lender: string }).lender,
  issue: (i) => { const d = i as { type: string; issuedOn?: string }; return `${d.type.replace("_", " ").toUpperCase()}${d.issuedOn ? ` ${d.issuedOn.slice(0, 4)}` : ""}`; },
  round: (i) => (i as { round: string }).round,
  holding: (i) => { const h = i as { what: string; heldWith?: string }; return `${h.what} ${h.heldWith ?? ""}`.trim(); },
};

// "Statement — [bank] ••[last4]" -> "Statement — HDFC ••1234". Unknown brackets are left as written.
function fill(text: string, by: string | null, i: Instance): string {
  if (!by || i === undefined) return text;
  const o = (typeof i === "object" ? i : {}) as Record<string, unknown>;
  const v = (k: string, fallback = ""): string => String(o[k] ?? fallback);
  return text
    .replace(/\[GSTIN\]/g, v("gstin")).replace(/\[state\]/g, typeof i === "string" ? i : v("state"))
    .replace(/\[bank\]/g, v("bank")).replace(/\[last4\]/g, v("last4")).replace(/\[gateway\]/g, typeof i === "string" ? i : v("gateway"))
    .replace(/\[lender\]/g, v("lender")).replace(/\[type\]/g, v("what", v("type"))).replace(/\[held with\]/g, v("heldWith"));
}

export function booksOwner(a: Answers): Owner {
  const c = a.books?.closer;
  if (c === "own") return "founder";
  if (c === "firm") return a.books?.firmOnPortal ? "external" : "pba";
  return "pba";
}
function ownerOf(key: string, a: Answers): Owner {
  if (key === "books") return booksOwner(a);
  if (key === "pba") return "pba";
  return "founder";
}
const tierOf = (t: string): Tier => (t === "mandatory" ? "mandatory" : t === "good to have" ? "good to have" : "others");

const INSTRUMENT_EVENT: Record<string, string> = { equity: "equity", ccps: "ccps", ocps_ocd: "ccps", ccd: "ccd", note: "cnote", venture_debt: "loan" };

export type EngineData = { rules: MasterRule[]; filings: MasterFiling[]; eventDocs: EventTypeDoc[]; library: LibDoc[] };

export function buildPlan(a: Answers, data: EngineData, today: Date = new Date()): Plan {
  const lib = new Map(data.library.map((d) => [d.code, d]));
  const rules = [...data.rules].sort((x, y) => x.sort - y.sort);
  const plan: Plan = { standard: [], events: [], recurring: [], filings: [] };

  const evDocs = (type: string, extraExpected: string[] = []): EventDocReq[] => {
    const rows = data.eventDocs.filter((d) => d.event_type === type);
    const out: EventDocReq[] = rows
      .filter((d) => d.doc_code && (d.need === "expected" || extraExpected.includes(d.doc_code)))
      .map((d) => ({ code: d.doc_code, name: lib.get(d.doc_code)?.name ?? d.doc_code, expected: true }));
    for (const code of extraExpected) {
      if (!out.some((d) => d.code === code)) out.push({ code, name: lib.get(code)?.name ?? code, expected: true });
    }
    return out;
  };

  for (const r of rules) {
    const test = CONDITIONS[r.cond];
    if (!test) throw new Error(`Rule ${r.rule_id} uses an unknown condition "${r.cond}"`);
    for (const inst of instancesOf(r.repeat_by, a)) {
      if (!test(a, inst, today)) continue;
      const id = r.repeat_by && inst !== undefined ? `${r.rule_id}:${typeof inst === "string" ? inst : (inst as { id: string }).id}` : r.rule_id;
      const name = fill(r.request, r.repeat_by, inst);
      const owner = ownerOf(r.owner_key, a);

      if (r.section === "standard") {
        plan.standard.push({ key: id, rule_id: r.rule_id, name, owner, tier: tierOf(r.tier), doc_type: r.doc_type });
      } else if (r.section === "from_company" || r.section === "books") {
        if (r.schedule === "monthly" || r.schedule === "quarter_end" || r.schedule === "march") {
          plan.recurring.push({ key: id, rule_id: r.rule_id, name, tier: tierOf(r.tier), owner, section: r.section, schedule: r.schedule, doc_type: r.doc_type });
        }
      } else if (r.section === "event") {
        const ev = eventFor(r, a, inst as Record<string, unknown>, evDocs);
        if (ev) plan.events.push({ ...ev, key: id, rule_id: r.rule_id });
      }
    }
  }

  // The incorporation event shares three records with the standard documents: asked once, shown in both places.
  const incorp = plan.events.find((e) => e.kind === "incorp");
  if (incorp) {
    const share: Record<string, string> = { COI: "coi", PAN: "pan", TAN: "tan" };
    for (const d of incorp.docs) {
      const std = plan.standard.find((s) => s.doc_type === share[d.code ?? ""]);
      if (std) d.sharedWith = std.key;
    }
  }
  // A redeemed issue's event repeats nothing the issue already holds (board resolution, register).
  for (const ev of plan.events.filter((e) => e.kind === "debred")) {
    const issue = plan.events.find((e) => e.key === `R48:${ev.key.split(":")[1]}`);
    if (issue) ev.docs = ev.docs.filter((d) => !issue.docs.some((x) => x.code === d.code));
  }

  const books = booksOwner(a);
  for (const f of [...data.filings].sort((x, y) => x.sort - y.sort)) {
    const test = CONDITIONS[f.cond];
    if (!test) throw new Error(`Filing ${f.filing_id} uses an unknown condition "${f.cond}"`);
    for (const inst of instancesOf(f.repeat_by, a)) {
      if (!test(a, inst, today)) continue;
      const tag = f.repeat_by && inst !== undefined ? LABEL[f.repeat_by](inst) : "";
      const state = f.repeat_by === "gstin" ? (inst as { state: string }).state : f.repeat_by === "state" ? String(inst) : undefined;
      plan.filings.push({
        key: `${f.filing_id}${tag ? `:${tag}` : ""}`, filing_id: f.filing_id, name: tag ? `${f.filing} — ${tag}` : f.filing,
        ticks: f.ticks, schedule: f.schedule, due_rule: f.due_rule, owner: books, doc_type: f.doc_type, state,
      });
    }
  }
  return plan;
}

function eventFor(r: MasterRule, a: Answers, inst: Record<string, unknown> | undefined, evDocs: (type: string, extra?: string[]) => EventDocReq[]): Omit<TimelineEvent, "key" | "rule_id"> | null {
  switch (r.rule_id) {
    case "R10": return { kind: "incorp", title: "Company incorporated", date: a.incorporatedOn ?? null, docs: evDocs("incorp") };
    case "R43": { const l = inst as { lender: string; takenOn?: string }; return { kind: "loan", title: `Loan taken — ${l.lender}`, date: l.takenOn ?? null, docs: evDocs("loan") }; }
    case "R48": {
      const d = inst as { type: string; issuedOn?: string };
      const kind = d.type === "ccd" ? "ccd" : "deb";
      return { kind, title: `${d.type === "ccd" ? "CCD" : "Debenture"} issue`, date: d.issuedOn ?? null, docs: evDocs(kind) };
    }
    case "R49": { const d = inst as { redeemedOn?: string }; return { kind: "debred", title: "Debentures redeemed", date: d.redeemedOn ?? null, docs: evDocs("debred") }; }
    case "R51": {
      const rd = inst as { round: string; instrument: string; closedOn?: string; foreign?: boolean };
      if (rd.instrument === "grant") return null; // a grant has its own rule (R53)
      const type = INSTRUMENT_EVENT[rd.instrument] ?? "equity";
      return { kind: type, title: `${rd.round} round`, date: rd.closedOn ?? null, docs: evDocs(type, rd.foreign ? ["VAL_FEMA", "FCGPR", "FIRC"] : []) };
    }
    case "R53": { const rd = inst as { round: string; closedOn?: string }; return { kind: "grant", title: `${rd.round} — grant`, date: rd.closedOn ?? null, docs: [{ code: null, name: "Grant letter and utilisation terms", expected: true }] }; }
    default: return null;
  }
}

// ---------------------------------------------------------------- months

export const periodOf = (y: number, m: number) => `${y}-${pad(m)}`;
export const isQuarterEnd = (period: string) => QUARTER_END.has(period.slice(5, 7));
const nextMonth = (period: string) => { const y = +period.slice(0, 4), m = +period.slice(5, 7); return m === 12 ? [y + 1, 1] : [y, m + 1]; };
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

// One rule for everyone: company documents by the 3rd of the next month, books and the MIS by the 7th.
export const DUE_DAY = { from_company: 3, books: 7, publish: 10 } as const;

export function requestsForPeriod(plan: Plan, period: string): Request[] {
  const m = period.slice(5, 7);
  const [ny, nm] = nextMonth(period);
  return plan.recurring
    .filter((r) => r.schedule === "monthly" || (r.schedule === "quarter_end" && QUARTER_END.has(m)) || (r.schedule === "march" && m === "03"))
    .map((r) => ({ ...r, period, due: ymd(ny, nm, DUE_DAY[r.section]) }));
}

function filingDue(f: FilingDef, period: string): string | null {
  const m = period.slice(5, 7), y = +period.slice(0, 4);
  const [ny, nm] = nextMonth(period);
  const d = f.due_rule;
  switch (d.kind) {
    case "day_next_month": {
      const o = d.overrides?.[m];
      return o ? `${ny}-${o}` : ymd(ny, nm, d.day ?? 1);
    }
    case "day_after_quarter": {
      const early = !d.early_states || (f.state && d.early_states.includes(f.state));
      return ymd(ny, nm, early ? d.day ?? 1 : d.alt_day ?? d.day ?? 1);
    }
    case "quarter_fixed": {
      const q = ({ "06": "1", "09": "2", "12": "3", "03": "4" } as Record<string, string>)[m];
      const mmdd = q ? d.by_quarter?.[q] : undefined;
      if (!mmdd) return null;
      const end = ymd(y, +m, 28);
      const same = `${y}-${mmdd}`;
      return same > end ? same : `${y + 1}-${mmdd}`;
    }
    case "half_year": {
      if (m === "09" && d.h1) return `${y}-${d.h1}`;
      if (m === "03" && d.h2) return `${y}-${d.h2}`;
      return null;
    }
  }
}

export function filingsForPeriod(plan: Plan, period: string): FilingRow[] {
  const m = period.slice(5, 7);
  const out: FilingRow[] = [];
  for (const f of plan.filings) {
    const show =
      f.schedule === "monthly" ||
      (f.schedule === "quarter_end" && QUARTER_END.has(m)) ||
      (f.schedule === "quarter_months_1_2" && !QUARTER_END.has(m)) ||
      (f.schedule === "half_yearly" && (m === "09" || m === "03"));
    if (!show) continue;
    const due = filingDue(f, period);
    if (due) out.push({ ...f, period, due });
  }
  return out;
}

export function standardDocCount(plan: Plan) { return plan.standard.length; }
export type { Plan, StdDoc, Recurring, FilingDef, Request, FilingRow, TimelineEvent };
