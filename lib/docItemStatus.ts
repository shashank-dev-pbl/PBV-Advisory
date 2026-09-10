import type { DocItem } from "@/lib/types";

export function isResolved(status: DocItem["status"]): boolean {
  return status === "accepted" || status === "not_applicable";
}

// A genuine submission — a file actually came in (or was accepted). Deliberately excludes
// not_applicable: for progress *counts* an N/A item hasn't produced anything, even though it
// still satisfies a deliverable's dependency (see isResolved, used for that instead).
export function isReceived(status: DocItem["status"]): boolean {
  return status === "uploaded" || status === "accepted" || status === "query";
}
