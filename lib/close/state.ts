// Month states and the four close conditions (spec 06). Pure: the page and the server actions both call this, so what the screen
// says and what the server allows can never disagree.
import { DUE_DAY, filingsForPeriod, requestsForPeriod } from "@/lib/master/engine";
import type { FilingRow, Plan, Request } from "@/lib/master/types";

export type MonthState = "published" | "submitted" | "collecting" | "late" | "open" | "untracked" | "upcoming";
export const STATE_LABEL: Record<MonthState, string> = {
  published: "Published", submitted: "Waiting for PBA check", collecting: "Collecting", late: "Late", open: "Month in progress", untracked: "Not tracked", upcoming: "Upcoming",
};
export const STATE_COLOUR: Record<MonthState, [string, string]> = {   // [text/line, background] — the prototype's palette
  published: ["#004d00", "#e6efe3"], submitted: ["#26527f", "#e9eef5"], collecting: ["#8a6412", "#fdf3dd"], late: ["#b3261e", "#fbe9e7"],
  open: ["#57544a", "#f1ece0"], untracked: ["#a8a293", "#f3efe6"], upcoming: ["#a8a293", "#f8f5ee"],
};

export const ymAdd = (ym: string, n: number) => { let y = +ym.slice(0, 4), m = +ym.slice(5) + n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return `${y}-${String(m).padStart(2, "0")}`; };
export const ymOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const dueOn = (ym: string, day: number) => `${ymAdd(ym, 1)}-${String(day).padStart(2, "0")}`;
export const monthEnded = (ym: string, today: Date) => ymOf(today) > ym;

export type Tick = { filingKey: string; tick: "paid" | "filed" };
export const tickKey = (filingKey: string, tick: string) => `F:${filingKey}:${tick}`;
export const misKey = "MIS";

export type MonthInput = {
  ym: string; today: Date; trackFrom: string; plan: Plan;
  has: (reqKey: string, period: string) => boolean;          // a current (not removed) file exists
  submitted: boolean; published: boolean;
};
export type MonthView = {
  state: MonthState; docs: Request[]; books: Request[]; filings: FilingRow[];
  mustTotal: number; mustIn: number; booksIn: boolean; ticksTotal: number; ticksIn: number; mis: boolean;
  total: number; done: number; late: number; ready: boolean;
};

export function monthView(i: MonthInput): MonthView {
  const reqs = requestsForPeriod(i.plan, i.ym);
  const docs = reqs.filter((r) => r.section === "from_company");
  const books = reqs.filter((r) => r.section === "books" && !/MIS/i.test(r.name));
  const filings = filingsForPeriod(i.plan, i.ym);
  const todayIso = `${i.today.getFullYear()}-${String(i.today.getMonth() + 1).padStart(2, "0")}-${String(i.today.getDate()).padStart(2, "0")}`;
  const hasIt = (k: string) => i.has(k, i.ym);

  const must = docs.filter((d) => d.tier === "mandatory");
  const mustIn = must.filter((d) => hasIt(d.key)).length;
  const booksIn = books.every((b) => hasIt(b.key));
  const ticks = filings.flatMap((f) => f.ticks.map((t) => ({ f, key: tickKey(f.key, t) })));
  const ticksIn = ticks.filter((t) => hasIt(t.key)).length;
  const mis = hasIt(misKey);
  const total = docs.length + books.length + ticks.length + 1;
  const done = docs.filter((d) => hasIt(d.key)).length + books.filter((b) => hasIt(b.key)).length + ticksIn + (mis ? 1 : 0);

  const lateDocs = todayIso > dueOn(i.ym, DUE_DAY.from_company) ? must.length - mustIn : 0;
  const lateFilings = filings.filter((f) => todayIso > f.due && !f.ticks.every((t) => hasIt(tickKey(f.key, t)))).length;
  const late = lateDocs + lateFilings;
  const ready = mustIn === must.length && booksIn && ticksIn === ticks.length && mis;

  let state: MonthState;
  if (i.ym > ymOf(i.today)) state = "upcoming";
  else if (i.ym < i.trackFrom) state = "untracked";
  else if (i.published) state = "published";
  else if (i.submitted) state = "submitted";
  else if (i.ym === ymOf(i.today)) state = "open";
  else state = late ? "late" : "collecting";
  return { state, docs, books, filings, mustTotal: must.length, mustIn, booksIn, ticksTotal: ticks.length, ticksIn, mis, total, done, late, ready };
}

// Server and screen share this: may this person do this to this month?
export type Role = "founder" | "external" | "pba";
export function canSubmit(role: Role, closer: Role | "own" | "firm" | "pba", v: MonthView, ym: string, today: Date): string | null {
  if (!monthEnded(ym, today)) return "A month cannot be submitted before it ends.";
  if (!v.ready) return "Everything for the month has to be in first: mandatory documents, books, every filing proof, and the MIS workbook.";
  if (role === "founder") return "Only the person who closes the books can submit.";
  if (role === "pba" && closer !== "pba") return "The external practitioner submits this company's month.";
  return null;
}
export function canPublish(role: Role, submittedBy: string | null, me: string): string | null {
  if (role !== "pba") return "Only Prime Bottomline can verify and publish.";
  if (submittedBy && submittedBy === me) return "You submitted this month, so someone else at Prime Bottomline has to publish it.";
  return null;
}
