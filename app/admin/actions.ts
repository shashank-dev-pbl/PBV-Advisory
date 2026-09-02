"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { currentPeriod } from "@/lib/period";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminEmail(user?.email)) throw new Error("Not authorized");
  return { supabase };
}

async function seedForPeriod(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  period: string,
  templateType: "once" | "monthly"
) {
  const { data: templates } = await supabase
    .from("doc_item_template")
    .select("*")
    .eq("period_type", templateType)
    .order("sort_order");

  if (templates && templates.length > 0) {
    const rows = templates.map((t) => ({
      company_id: companyId,
      code: t.code,
      group_name: t.group_name,
      title: t.title,
      prompt: t.prompt,
      period: templateType === "once" ? "ONCE" : period,
      status: "pending" as const,
    }));
    await supabase.from("doc_item").upsert(rows, { onConflict: "company_id,code,period", ignoreDuplicates: true });
  }

  const { data: dTemplates } = await supabase
    .from("deliverable_template")
    .select("*")
    .eq("period_type", templateType)
    .order("sort_order");

  if (dTemplates && dTemplates.length > 0) {
    const rows = dTemplates.map((t) => ({
      company_id: companyId,
      code: t.code,
      title: t.title,
      period: templateType === "once" ? "ONCE" : period,
      input_codes: t.input_codes,
      status: "blocked" as const,
    }));
    await supabase.from("deliverable").upsert(rows, { onConflict: "company_id,code,period", ignoreDuplicates: true });
  }
}

export async function createCompanyWithUsers(params: {
  companyName: string;
  founderName: string;
  founderEmail: string;
  practitionerName: string;
  practitionerEmail: string;
}) {
  const { supabase } = await requireAdmin();

  const { data: company, error: companyError } = await supabase
    .from("company")
    .insert({ name: params.companyName })
    .select()
    .single();
  if (companyError) throw companyError;

  const { error: usersError } = await supabase.from("app_user").insert([
    { email: params.founderEmail.toLowerCase(), name: params.founderName, role: "founder", company_id: company.id },
    { email: params.practitionerEmail.toLowerCase(), name: params.practitionerName, role: "practitioner", company_id: company.id },
  ]);
  if (usersError) throw usersError;

  await seedForPeriod(supabase, company.id, "ONCE", "once");
  await seedForPeriod(supabase, company.id, currentPeriod(), "monthly");

  revalidatePath("/admin");
  return company.id as string;
}

export async function runMonthlySeed(companyId: string) {
  const { supabase } = await requireAdmin();
  await seedForPeriod(supabase, companyId, currentPeriod(), "monthly");
  revalidatePath("/admin");
}

export async function listCompaniesWithStats() {
  const { supabase } = await requireAdmin();
  const { data: companies } = await supabase.from("company").select("*").order("created_at", { ascending: false });
  const result = [];
  for (const c of companies ?? []) {
    const { count: total } = await supabase
      .from("doc_item")
      .select("*", { count: "exact", head: true })
      .eq("company_id", c.id);
    const { count: received } = await supabase
      .from("doc_item")
      .select("*", { count: "exact", head: true })
      .eq("company_id", c.id)
      .in("status", ["uploaded", "accepted", "not_applicable"]);
    const { data: users } = await supabase.from("app_user").select("*").eq("company_id", c.id);
    result.push({ company: c, total: total ?? 0, received: received ?? 0, users: users ?? [] });
  }
  return result;
}
