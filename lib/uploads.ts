import type { DocItem, DocPriority } from "@/lib/types";

// Everything the Uploads tabs need to decide, in plain functions: what state a row is in, what is
// late, what to show first. Only Mandatory items can ever be late — the others are asked once, never chased.

export type RowKey = "late" | "query" | "todo" | "submitted" | "accepted" | "nil" | "na";

export const NIL_REASON = "Founder confirmed — none to report";

export function rowKey(item: DocItem, today: string): RowKey {
  switch (item.status) {
    case "accepted": return "accepted";
    case "not_applicable": return item.na_reason === NIL_REASON ? "nil" : "na";
    case "query": return "query";
    case "uploaded": return "submitted";
    default:
      return item.priority === "must" && item.due_date !== null && item.due_date < today ? "late" : "todo";
  }
}

export const isDone = (k: RowKey) => k === "accepted" || k === "nil" || k === "na";

// Rows that need action come first: late, then questions, then to do, then what is with us, then done.
export const RANK: Record<RowKey, number> = { late: 0, query: 1, todo: 2, submitted: 3, accepted: 4, nil: 4, na: 4 };

export const STATUS_TAG: Record<RowKey, { label: string; bg: string; color: string }> = {
  todo: { label: "To do", bg: "#f1ece0", color: "#6b6357" },
  late: { label: "Late", bg: "#fbe9e7", color: "#b3261e" },
  submitted: { label: "With us", bg: "#e9eef5", color: "#26527f" },
  query: { label: "Question for you", bg: "#fdf3dd", color: "#8a6412" },
  accepted: { label: "Accepted", bg: "#e8efe6", color: "#1e4620" },
  nil: { label: "You said none", bg: "#e8efe6", color: "#1e4620" },
  na: { label: "Not applicable", bg: "#e8efe6", color: "#1e4620" },
};

export const TIERS: Record<DocPriority, { name: string; color: string; soft: string; tip: string }> = {
  must: {
    name: "Mandatory",
    color: "#b4531a",
    soft: "#fbeee4",
    tip: "We cannot produce your monthly report without these. These are the only items we chase, and the only ones that can delay your MIS.",
  },
  good: {
    name: "Good to have",
    color: "#26527f",
    soft: "#e9eef5",
    tip: "These make the report sharper. We ask once and never chase. They never hold anything up.",
  },
  cosmetic: {
    name: "Others",
    color: "#8b8779",
    soft: "#f1ece0",
    tip: "Useful for our records. Send them when convenient, or skip them. Never chased, never block anything.",
  },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function shortDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

const RULE_TEXT: Record<string, string> = {
  Onboarding: "At onboarding",
  "On signing": "When signed",
  "48 hours": "Within 48 hours of receiving",
  February: "February",
  "Post-audit": "After the audit",
  "Post-filing": "After filing",
  "Q+30": "30 days after the quarter",
  "Q+3": "3 days after the quarter",
};

export function dueLabel(item: DocItem): string {
  if (item.due_date) return `Due ${shortDate(item.due_date)}`;
  return `Due ${RULE_TEXT[item.due_rule ?? ""] ?? item.due_rule ?? "when ready"}`;
}

export function daysLate(item: DocItem, today: string): number {
  if (!item.due_date) return 0;
  return Math.max(0, Math.round((new Date(today).getTime() - new Date(item.due_date).getTime()) / 86400000));
}
