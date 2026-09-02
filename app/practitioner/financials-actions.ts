"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { previousPeriods } from "@/lib/period";
import type { MonthlyFinancials } from "@/lib/types";

export async function getFinancialsHistory(companyId: string, period: string, months = 6) {
  const supabase = await createClient();
  const periods = previousPeriods(period, months);
  const { data } = await supabase
    .from("monthly_financials")
    .select("*")
    .eq("company_id", companyId)
    .in("period", periods)
    .order("period", { ascending: true });
  return (data ?? []) as MonthlyFinancials[];
}

export async function getFinancialsForPeriod(companyId: string, period: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("monthly_financials")
    .select("*")
    .eq("company_id", companyId)
    .eq("period", period)
    .maybeSingle();
  return data as MonthlyFinancials | null;
}

type FinancialsInput = Partial<Omit<MonthlyFinancials, "id" | "company_id" | "period" | "status" | "version" | "published_at" | "prepared_by" | "created_at" | "updated_at">>;

function validateSums(fields: FinancialsInput): string[] {
  const errors: string[] = [];
  const num = (v: unknown) => (typeof v === "number" ? v : 0);

  const revSum = num(fields.revenue_subscription) + num(fields.revenue_service) + num(fields.revenue_project);
  if (fields.revenue_total !== null && fields.revenue_total !== undefined && Math.round(revSum) !== Math.round(fields.revenue_total)) {
    errors.push(`Subscription + service + project revenue (${revSum}) must equal revenue total (${fields.revenue_total}).`);
  }

  const ageingSum = num(fields.receivables_0_30) + num(fields.receivables_31_60) + num(fields.receivables_61_90) + num(fields.receivables_90_plus);
  if (fields.receivables_total !== null && fields.receivables_total !== undefined && Math.round(ageingSum) !== Math.round(fields.receivables_total)) {
    errors.push(`The four ageing buckets (${ageingSum}) must equal receivables total (${fields.receivables_total}).`);
  }

  if (
    fields.cash_opening !== null && fields.cash_opening !== undefined &&
    fields.cash_closing !== null && fields.cash_closing !== undefined &&
    fields.net_burn !== null && fields.net_burn !== undefined
  ) {
    const expectedClosing = fields.cash_opening - fields.net_burn;
    if (Math.round(expectedClosing) !== Math.round(fields.cash_closing)) {
      errors.push(`Closing cash (${fields.cash_closing}) must equal opening cash minus net burn (${expectedClosing}).`);
    }
  }

  return errors;
}

export async function saveDraft(companyId: string, period: string, fields: FinancialsInput) {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("monthly_financials")
    .select("id, status")
    .eq("company_id", companyId)
    .eq("period", period)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("monthly_financials").update(fields).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("monthly_financials").insert({ company_id: companyId, period, status: "draft", ...fields });
    if (error) throw error;
  }

  revalidatePath("/practitioner/dashboard");
  revalidatePath("/founder/dashboard");
}

export async function publish(companyId: string, period: string, fields: FinancialsInput) {
  const errors = validateSums(fields);
  if (errors.length > 0) throw new Error(errors.join(" "));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: existing } = await supabase
    .from("monthly_financials")
    .select("id, version")
    .eq("company_id", companyId)
    .eq("period", period)
    .maybeSingle();

  const nextVersion = existing ? existing.version + 1 : 1;
  const publishedAt = new Date().toISOString();

  let financialsId: string;
  if (existing) {
    const { error } = await supabase
      .from("monthly_financials")
      .update({ ...fields, status: "published", version: nextVersion, published_at: publishedAt, prepared_by: user?.email ?? null })
      .eq("id", existing.id);
    if (error) throw error;
    financialsId = existing.id;
  } else {
    const { data: inserted, error } = await supabase
      .from("monthly_financials")
      .insert({ company_id: companyId, period, status: "published", version: nextVersion, published_at: publishedAt, prepared_by: user?.email ?? null, ...fields })
      .select("id")
      .single();
    if (error) throw error;
    financialsId = inserted.id;
  }

  const { data: fullRow } = await supabase.from("monthly_financials").select("*").eq("id", financialsId).single();
  await supabase.from("monthly_financials_history").insert({
    monthly_financials_id: financialsId,
    version: nextVersion,
    snapshot: fullRow,
  });

  revalidatePath("/practitioner/dashboard");
  revalidatePath("/founder/dashboard");
}
