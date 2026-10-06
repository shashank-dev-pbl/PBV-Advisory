// Pure helpers for the data room — safe for client components. The lists of event types, documents and
// standard kinds live in the database (doc_library, event_type, event_type_doc, standard_kind) so a
// reviewer can correct a row without a release.

export const CATEGORY_COLOUR: Record<string, string> = {
  Founding: "#1e4620",
  Fundraise: "#6b8f5a",
  "Debt & charges": "#8a6412",
  "People & ESOP": "#3d6a73",
  "Structure & governance": "#8b8779",
};

export type LibDoc = { code: string; name: string; form: string | null };
export type EventType = { code: string; name: string; category: string };
export type EventTypeDoc = { event_type: string; doc_code: string; need: "expected" | "if_applies"; condition_note: string | null };
export type StdKind = { code: string; label: string; grp: string; sort: number; doc_codes: string[] };

export type EventDocRow = {
  id: string;
  event_id: string;
  doc_code: string | null;
  other_name: string | null;
  status: "uploaded" | "not_applicable";
  na_reason: string | null;
  storage_path: string | null;
  filename: string | null;
  by_name: string | null;
  at: string;
};
export type EventRow = {
  id: string;
  type: string;
  event_date: string;
  title: string;
  description: string | null;
  amount: string | null;
  created_by_name: string | null;
};
export type StdDocRow = {
  id: string;
  kind: string;
  version: number;
  storage_path: string;
  filename: string;
  source: string;
  by_name: string | null;
  at: string;
};

// A document counts as dealt with once it is uploaded or marked not applicable.
export function docState(rows: EventDocRow[], code: string): "uploaded" | "not_applicable" | null {
  const mine = rows.filter((r) => r.doc_code === code);
  if (mine.some((r) => r.status === "uploaded")) return "uploaded";
  if (mine.some((r) => r.status === "not_applicable")) return "not_applicable";
  return null;
}

export function eventStats(expectedCodes: string[], rows: EventDocRow[]) {
  const done = expectedCodes.filter((c) => docState(rows, c) !== null).length;
  return { total: expectedCodes.length, done, missing: expectedCodes.length - done };
}

export function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
