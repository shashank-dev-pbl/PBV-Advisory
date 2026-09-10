export function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Returns `count` period strings ending at (and including) `period`, oldest first.
// e.g. previousPeriods("2026-08", 3) -> ["2026-06", "2026-07", "2026-08"]
export function previousPeriods(period: string, count: number): string[] {
  const [y, m] = period.split("-").map(Number);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const date = new Date(y, m - 1 - i, 1);
    out.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export function formatPeriodLabel(period: string): string {
  if (period === "ONCE") return "One-time";
  const [y, m] = period.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// The "work" financial year a given month falls in — computed from the
// company's FY start month/day, not stored, so it's never out of sync with
// itself. "FY26" = the FY ending March 2026 (Indian convention: named for
// the year it closes in), regardless of which calendar year it started.
export function fyForPeriod(period: string, financialYearStart: string): string {
  const [y, m] = period.split("-").map(Number);
  const fyStartMonth = new Date(financialYearStart).getMonth(); // 0-indexed
  const endYear = m - 1 >= fyStartMonth ? y + 1 : y;
  return `FY${String(endYear).slice(-2)}`;
}
