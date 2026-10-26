// One row per company for the Companies table (prototype): services, who keeps the books, where the monthly close stands, legal waiting.
import type { SupabaseClient } from "@supabase/supabase-js";
import { lateMonthCount } from "@/lib/close/late";
import { externalFirmName } from "@/lib/firm";

export type CompanyOverview = { id: string; name: string; plan: string; status: string; booksBy: string; pba: string; late: number; waiting: boolean; legalToPrice: number };
const PLAN: Record<string, string> = { starter: "Starter", builder: "Builder", operator: "Operator" };

export async function companyOverview(supabase: SupabaseClient, ids: string[]): Promise<CompanyOverview[]> {
  if (!ids.length) return [];
  const [companies, access, masters, waiting, toPrice] = await Promise.all([
    supabase.from("company").select("id, name, plan, status").in("id", ids).order("created_at"),
    supabase.from("company_access").select("company_id, role, user:user_id(name, hidden)").in("company_id", ids).is("revoked_at", null).eq("role", "pba"),
    supabase.from("company_master").select("company_id, answers").in("company_id", ids),
    supabase.from("month").select("company_id, submitted_at, published_at").in("company_id", ids).not("submitted_at", "is", null).is("published_at", null),
    supabase.from("legal_request").select("company_id").in("company_id", ids).eq("status", "quote"),
  ]);
  const pbaBy = new Map<string, string[]>();
  for (const a of (access.data ?? []) as unknown as { company_id: string; user: { name: string | null; hidden: boolean } | null }[]) {
    if (!a.user || a.user.hidden) continue;
    pbaBy.set(a.company_id, [...(pbaBy.get(a.company_id) ?? []), a.user.name ?? "—"]);
  }
  const waitingSet = new Set((waiting.data ?? []).map((w) => w.company_id as string));
  const rows = await Promise.all((companies.data ?? []).map(async (c) => {
    const answers = (masters.data ?? []).find((m) => m.company_id === c.id)?.answers as { books?: { closer?: string; firmName?: string } } | undefined;
    const closer = answers?.books?.closer;
    const firm = closer === "firm" ? answers?.books?.firmName || (await externalFirmName(supabase, c.id)) || "External firm" : closer === "own" ? "In-house" : closer === "pba" ? "Prime Bottomline" : (await externalFirmName(supabase, c.id)) ?? "—";
    return {
      id: c.id as string, name: c.name as string, plan: PLAN[c.plan as string] ?? (c.plan as string), status: c.status as string,
      booksBy: firm, pba: (pbaBy.get(c.id as string) ?? []).join(", ") || "—",
      late: c.status === "live" ? await lateMonthCount(c.id as string) : 0, waiting: waitingSet.has(c.id as string), legalToPrice: (toPrice.data ?? []).filter((x) => x.company_id === c.id).length,
    };
  }));
  return rows;
}
