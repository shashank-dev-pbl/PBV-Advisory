import type { MonthlyFinancials } from "./types";

// All values computed at read time, never stored — a corrected earlier month
// automatically fixes every average/trend that depends on it (per spec).

function avg(nums: (number | null)[]): number | null {
  const present = nums.filter((n): n is number => n !== null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

export function runwayMonths(published: MonthlyFinancials[]): { months: number | null; monthsOfHistory: number } {
  const burns = published.map((m) => m.net_burn);
  const monthsOfHistory = burns.filter((b) => b !== null).length;
  if (monthsOfHistory < 3) return { months: null, monthsOfHistory };
  const last3 = burns.slice(-3);
  const avgBurn = avg(last3);
  const latest = published[published.length - 1];
  if (!avgBurn || avgBurn <= 0 || latest.cash_closing === null) return { months: null, monthsOfHistory };
  const usable = (latest.cash_closing ?? 0) - (latest.cash_restricted ?? 0);
  return { months: usable / avgBurn, monthsOfHistory };
}

export function averageMonthlyExpenses(published: MonthlyFinancials[]): { value: number | null; count: number } {
  const last5 = published.slice(-5).map((m) => m.expenses_accrual);
  const count = last5.filter((v) => v !== null).length;
  return { value: avg(last5), count };
}

export function changeVsLastMonth(published: MonthlyFinancials[], field: keyof MonthlyFinancials): number | null {
  if (published.length < 2) return null;
  const latest = published[published.length - 1][field];
  const prev = published[published.length - 2][field];
  if (typeof latest !== "number" || typeof prev !== "number") return null;
  return latest - prev;
}

export function revenueMix(m: MonthlyFinancials): { subscription: number; service: number; project: number } | null {
  if (m.revenue_total === null || m.revenue_total === 0) return null;
  const total = m.revenue_total;
  return {
    subscription: ((m.revenue_subscription ?? 0) / total) * 100,
    service: ((m.revenue_service ?? 0) / total) * 100,
    project: ((m.revenue_project ?? 0) / total) * 100,
  };
}

export function concentration(m: MonthlyFinancials): { topPct: number | null; top5Pct: number | null } {
  if (!m.revenue_total) return { topPct: null, top5Pct: null };
  return {
    topPct: m.top_client_revenue !== null ? (m.top_client_revenue / m.revenue_total) * 100 : null,
    top5Pct: m.top5_client_revenue !== null ? (m.top5_client_revenue / m.revenue_total) * 100 : null,
  };
}

export function collectionDays(m: MonthlyFinancials): number | null {
  if (!m.billed_month || m.receivables_total === null) return null;
  return (m.receivables_total / m.billed_month) * 30;
}

export function collectionEfficiency(m: MonthlyFinancials): number | null {
  if (!m.billed_month || m.collections_month === null) return null;
  return (m.collections_month / m.billed_month) * 100;
}

// Below 80% for two consecutive published months.
export function collectionEfficiencyAlert(published: MonthlyFinancials[]): boolean {
  const last2 = published.slice(-2);
  if (last2.length < 2) return false;
  return last2.every((m) => {
    const eff = collectionEfficiency(m);
    return eff !== null && eff < 80;
  });
}
