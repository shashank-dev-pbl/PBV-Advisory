import { createClient } from "@/lib/supabase/server";
import { previousPeriods } from "@/lib/period";
import type { MonthlyFinancials, PeriodFigures } from "@/lib/types";

// FinancialTiles/dashboardCalc were built against MonthlyFinancials (Build 2's
// manual-entry table). Rather than fork the dashboard for period_figures, this
// adapts a published period_figures row into that same shape — the numeric
// fields match exactly; the compliance fields (filings/notices) don't exist
// yet on period_figures (they move to the obligation table in a later phase),
// so they're left null rather than guessed at.
function toMonthlyFinancialsShape(pf: PeriodFigures): MonthlyFinancials {
  return {
    id: pf.id,
    company_id: pf.company_id,
    period: pf.period,
    status: "published",
    version: pf.version,
    published_at: pf.published_at,
    prepared_by: pf.submitted_by,

    cash_opening: pf.cash_opening,
    cash_closing: pf.cash_closing,
    cash_restricted: pf.cash_restricted,
    gross_burn: pf.gross_burn,
    net_burn: pf.net_burn,
    expenses_accrual: pf.expenses_accrual,

    revenue_total: pf.revenue_total,
    revenue_subscription: pf.revenue_subscription,
    revenue_service: pf.revenue_service,
    revenue_project: pf.revenue_project,
    partner_share_paid: pf.partner_share_paid,

    clients_active: pf.clients_active,
    clients_added: pf.clients_added,
    clients_lost: pf.clients_lost,
    top_client_revenue: pf.top_client_revenue,
    top5_client_revenue: pf.top5_client_revenue,

    receivables_total: pf.receivables_total,
    receivables_0_30: pf.receivables_0_30,
    receivables_31_60: pf.receivables_31_60,
    receivables_61_90: pf.receivables_61_90,
    receivables_90_plus: pf.receivables_90_plus,
    payables_total: pf.payables_total,
    billed_month: pf.billed_month,
    collections_month: pf.collections_month,

    filings_current: null,
    filings_due_30d: null,
    filings_due_note: null,
    notices_open: null,

    created_at: pf.created_at,
    updated_at: pf.created_at,
  };
}

// Published history for a company, oldest first, for the given trailing
// window of periods — the only thing the founder (and, read-only, the
// practitioner) dashboard ever reads.
export async function getPublishedHistory(companyId: string, period: string, months = 6): Promise<MonthlyFinancials[]> {
  const supabase = await createClient();
  const periods = previousPeriods(period, months);

  const { data } = await supabase
    .from("period_figures")
    .select("*")
    .eq("company_id", companyId)
    .in("period", periods)
    .eq("state", "published")
    .order("period", { ascending: true })
    .order("version", { ascending: false });

  const rows = (data ?? []) as PeriodFigures[];
  const latestPerPeriod = new Map<string, PeriodFigures>();
  for (const row of rows) {
    if (!latestPerPeriod.has(row.period)) latestPerPeriod.set(row.period, row);
  }

  return periods
    .filter((p) => latestPerPeriod.has(p))
    .map((p) => toMonthlyFinancialsShape(latestPerPeriod.get(p)!));
}
