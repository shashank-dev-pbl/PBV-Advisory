// The data room is built from the company master, never typed in. Pure: groups the master's standard documents the way the
// prototype does, and turns the master's events into timeline entries whose documents share a key with the master wizard,
// so a file uploaded in either place shows in both.
import type { Answers, Owner, Plan, TimelineEvent } from "@/lib/master/types";

export type StdItem = { key: string; name: string; owner: Owner; docType: string | null };
export type StdGroup = { title: string; step: number; items: StdItem[] };
export type Cat = "found" | "raise" | "debt";
export const CAT_COLOUR: Record<Cat, string> = { found: "#1e4620", raise: "#2a78d6", debt: "#eb6834" };
export const CAT_NAME: Record<Cat, string> = { found: "Founding", raise: "Fundraise", debt: "Debt & charges" };

const GROUP_OF: Record<string, [string, number]> = {
  R01: ["Constitution", 1], R02: ["Constitution", 1], R03: ["Constitution", 1], R04: ["Constitution", 1], R05: ["Constitution", 1], R06: ["Constitution", 1], R07: ["Constitution", 1],
  R17: ["Tax registrations", 4],
  R08: ["Financials", 1], R11: ["Financials", 2],
  R35: ["Ownership and agreements", 7], R38: ["Ownership and agreements", 7], R54: ["Ownership and agreements", 10],
  R23: ["People", 5],
};
const ORDER = ["Constitution", "Tax registrations", "Financials", "Ownership and agreements", "People"];

export function standardGroups(plan: Plan): StdGroup[] {
  const by = new Map<string, StdGroup>();
  for (const s of plan.standard) {
    const [title, step] = GROUP_OF[s.rule_id] ?? ["Other", 1];
    if (!by.has(title)) by.set(title, { title, step, items: [] });
    by.get(title)!.items.push({ key: s.key, name: s.name, owner: s.owner, docType: s.doc_type });
  }
  return [...by.values()].sort((a, b) => ORDER.indexOf(a.title) - ORDER.indexOf(b.title));
}

export type EventDoc = { key: string; name: string; code: string | null; owner: Owner; expected: boolean };
export type RoomEvent = { key: string; title: string; date: string | null; type: string; cat: Cat; step: number; docs: EventDoc[] };

const CAT: Record<string, Cat> = { incorp: "found", loan: "debt", deb: "debt", debred: "debt" };
const TYPE_NAME: Record<string, string> = { incorp: "Incorporation", loan: "Loan taken", deb: "Debenture issue", debred: "Debenture redemption", ccps: "CCPS round", ccd: "CCD round", equity: "Equity round", grant: "Grant", note: "Convertible note" };
const STEP: Record<string, number> = { incorp: 1, loan: 8, deb: 9, debred: 9 };

export function roomEvents(plan: Plan, ownerOf: (code: string | null) => Owner): RoomEvent[] {
  return plan.events
    .map((e: TimelineEvent): RoomEvent => ({
      key: e.key, title: e.title, date: e.date, type: TYPE_NAME[e.kind] ?? "Funding round", cat: CAT[e.kind] ?? "raise", step: STEP[e.kind] ?? 10,
      docs: e.docs.map((d) => ({ key: d.sharedWith ?? `${e.key}:${d.code ?? d.name}`, name: d.name, code: d.code, owner: ownerOf(d.code), expected: d.expected })),
    }))
    .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
}

// The timeline starts in the incorporation year and runs to the end of this year.
export function timelineYears(a: Answers, today: Date): number[] {
  const start = a.incorporatedOn ? +a.incorporatedOn.slice(0, 4) : today.getFullYear();
  const out: number[] = []; for (let y = start; y <= today.getFullYear(); y++) out.push(y); return out;
}

// Which explainer describes an event document, by its library code; anything else falls back to the generic one.
export const EVENT_DOC_EXPLAINER: Record<string, string> = { COI: "coi", PAN: "pan", TAN: "tan", BR: "br", PAS3: "pas3", MGT14: "mgt14", CHG4: "chg4", CHG1: "chg", CHG9: "chg", CHGC: "chg", REDEEM: "red", DCERT: "dcert", TERM: "ts", SSA: "sha", SHA: "sha" };
