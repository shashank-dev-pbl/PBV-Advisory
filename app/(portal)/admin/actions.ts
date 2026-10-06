"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { DEV_BYPASS_AUTH } from "@/lib/devBypass";
import { isCurrentUserPlatformAdmin } from "@/lib/admin";
import { normalizePhone } from "@/lib/phone";
import { closePeriod, monthlyDueDate } from "@/lib/period";
import type { AccountType, CompanyRole } from "@/lib/types";

type Client = Awaited<ReturnType<typeof createClient>>;

// Admin only — checked here, and again by row-level security (is_platform_admin()) on every table touched.
async function requireAdmin() {
  const s = await getSession();
  if (s.who !== "admin" || !s.user) throw new Error("You don't have access to this action");
  if (!DEV_BYPASS_AUTH && !(await isCurrentUserPlatformAdmin())) throw new Error("You don't have access to this action");
  return { supabase: await createClient(), adminName: s.user.name ?? "Admin" };
}

async function writeLog(supabase: Client, who: string, e: {
  action: string; targetUserId?: string | null; targetName?: string | null; companyId?: string | null; companyName?: string | null; detail?: string;
}) {
  await supabase.from("access_log").insert({
    who_name: who,
    action: e.action,
    target_user_id: e.targetUserId ?? null,
    target_name: e.targetName ?? null,
    company_id: e.companyId ?? null,
    company_name: e.companyName ?? null,
    detail: e.detail ?? null,
  });
}

function friendly(error: { code?: string; message: string }): Error {
  if (error.code === "23505") return new Error("That mobile number or email is already used by someone else. Two people cannot share a number.");
  if (error.code === "42501" || /row-level security/i.test(error.message)) {
    return new Error("The database refused this change. While real sign-in is off, admin changes are switched off by default.");
  }
  return new Error(error.message);
}

const ROLE_FOR: Record<Exclude<AccountType, "admin">, CompanyRole> = { founder: "founder", external: "external", pba: "pba" };
const LEGACY_ROLE: Record<AccountType, "founder" | "practitioner" | "pba"> = { founder: "founder", external: "practitioner", pba: "pba", admin: "pba" };

// ---------- checklist generation ----------

// One-time and quarterly/yearly items are a single standing row each; monthly items belong to the month being closed
// and carry their own due date ("Day 3" = the 3rd of the month after it).
async function seedChecklist(supabase: Client, companyId: string, closeMonth: string, only?: "monthly") {
  const { data: templates } = await supabase.from("doc_item_template").select("*").order("sort_order");
  const rows = (templates ?? [])
    .filter((t) => !only || t.cadence === only)
    .map((t) => {
      const day = /^Day (\d+)$/.exec(t.due_rule ?? "");
      return {
        company_id: companyId,
        code: t.code,
        group_name: t.group_name,
        title: t.title,
        prompt: t.prompt,
        description: t.description,
        priority: t.priority,
        allows_multiple: t.allows_multiple,
        needs_label: t.needs_label,
        nil_return_allowed: t.nil_return_allowed,
        register_ref: t.register_ref,
        cadence: t.cadence,
        due_rule: t.due_rule,
        supplied_by_external: t.supplied_by_external,
        period: t.cadence === "monthly" ? closeMonth : "ONCE",
        due_date: t.cadence === "monthly" && day ? monthlyDueDate(closeMonth, Number(day[1])) : null,
        status: "pending" as const,
      };
    });
  if (rows.length > 0) {
    const { error } = await supabase.from("doc_item").upsert(rows, { onConflict: "company_id,code,period", ignoreDuplicates: true });
    if (error) throw new Error(`Could not generate the checklist: ${error.message}`);
  }
  if (only) return;

  for (const kind of ["once", "monthly"] as const) {
    const { data: dTemplates } = await supabase.from("deliverable_template").select("*").eq("period_type", kind).order("sort_order");
    if (dTemplates && dTemplates.length > 0) {
      const dRows = dTemplates.map((t) => ({
        company_id: companyId,
        code: t.code,
        title: t.title,
        period: kind === "once" ? "ONCE" : closeMonth,
        input_codes: t.input_codes,
        status: "blocked" as const,
      }));
      const { error } = await supabase.from("deliverable").upsert(dRows, { onConflict: "company_id,code,period", ignoreDuplicates: true });
      if (error) throw new Error(`Could not generate the deliverables: ${error.message}`);
    }
  }
}

// ---------- companies ----------

export async function createCompany(params: {
  name: string;
  fyStartMonth: "04" | "01";
  plan: "starter" | "builder" | "operator";
  firstCollectPeriod: string;
  booksBy: "auditor" | "pba";
}) {
  const { supabase, adminName } = await requireAdmin();
  if (!params.name.trim()) throw new Error("Give the company a name");
  if (!/^\d{4}-\d{2}$/.test(params.firstCollectPeriod)) throw new Error("Choose the first month to collect");

  const { data: company, error } = await supabase
    .from("company")
    .insert({
      name: params.name.trim(),
      plan: params.plan,
      financial_year_start: `2026-${params.fyStartMonth}-01`,
      books_by: params.booksBy,
      first_collect_period: params.firstCollectPeriod,
      status: "setting_up",
    })
    .select("id, name")
    .single();
  if (error) throw friendly(error);

  await seedChecklist(supabase, company.id, params.firstCollectPeriod);
  await writeLog(supabase, adminName, { action: "company_created", companyId: company.id, companyName: company.name, detail: `${params.plan} plan` });
  revalidatePath("/", "layout");
  return company.id as string;
}

export type CompanyRow = {
  id: string;
  name: string;
  plan: string;
  status: "setting_up" | "live";
  fyStart: string;
  booksBy: "auditor" | "pba";
  founder: string[];
  external: string[];
  pba: string[];
};

type AccessJoin = { company_id: string; role: CompanyRole; user: { name: string | null; email: string; firm_name: string | null } | null };

export async function listCompanies(): Promise<CompanyRow[]> {
  const { supabase } = await requireAdmin();
  const [{ data: companies }, { data: grants }] = await Promise.all([
    supabase.from("company").select("id, name, plan, status, financial_year_start, books_by").order("created_at"),
    supabase.from("company_access").select("company_id, role, user:user_id(name, email, firm_name)").is("revoked_at", null),
  ]);
  const byCompany = new Map<string, AccessJoin[]>();
  for (const g of (grants ?? []) as unknown as AccessJoin[]) {
    byCompany.set(g.company_id, [...(byCompany.get(g.company_id) ?? []), g]);
  }
  const label = (g: AccessJoin) => (g.role === "external" && g.user?.firm_name ? g.user.firm_name : g.user?.name ?? g.user?.email ?? "—");
  return (companies ?? []).map((c) => {
    const gs = byCompany.get(c.id) ?? [];
    return {
      id: c.id,
      name: c.name,
      plan: c.plan,
      status: c.status,
      fyStart: new Date(c.financial_year_start).getMonth() === 3 ? "April" : "January",
      booksBy: c.books_by,
      founder: gs.filter((g) => g.role === "founder").map(label),
      external: gs.filter((g) => g.role === "external").map(label),
      pba: gs.filter((g) => g.role === "pba").map(label),
    };
  });
}

export type AccessRow = { id: string; userId: string; name: string; mobile: string | null; role: CompanyRole; firm: string | null };

export async function getCompanyDetail(companyId: string): Promise<{ company: CompanyRow; people: AccessRow[]; addable: { id: string; label: string; accountType: AccountType }[]; monthlyReady: boolean; closeMonth: string } | null> {
  const { supabase } = await requireAdmin();
  const companies = await listCompanies();
  const company = companies.find((c) => c.id === companyId);
  if (!company) return null;

  const { data: grants } = await supabase
    .from("company_access")
    .select("id, role, user:user_id(id, name, email, phone, firm_name)")
    .eq("company_id", companyId)
    .is("revoked_at", null)
    .order("granted_at");
  const people = ((grants ?? []) as unknown as { id: string; role: CompanyRole; user: { id: string; name: string | null; email: string; phone: string | null; firm_name: string | null } | null }[])
    .filter((g) => g.user)
    .map((g) => ({ id: g.id, userId: g.user!.id, name: g.user!.name ?? g.user!.email, mobile: g.user!.phone, role: g.role, firm: g.user!.firm_name }));

  const onIt = new Set(people.map((p) => p.userId));
  const { data: everyone } = await supabase
    .from("app_user")
    .select("id, name, email, account_type, phone")
    .neq("account_type", "admin")
    .not("phone", "is", null)
    .order("name");
  const addable = (everyone ?? [])
    .filter((u) => !onIt.has(u.id) && u.account_type)
    .map((u) => ({ id: u.id, label: u.name ?? u.email, accountType: u.account_type as AccountType }));

  const { count: monthlyCount } = await supabase
    .from("doc_item")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("cadence", "monthly")
    .eq("period", closePeriod());

  return { company, people, addable, monthlyReady: (monthlyCount ?? 0) > 0, closeMonth: closePeriod() };
}

export async function goLive(companyId: string) {
  const { supabase, adminName } = await requireAdmin();
  const { data: grants } = await supabase.from("company_access").select("role").eq("company_id", companyId).is("revoked_at", null);
  const roles = new Set((grants ?? []).map((g) => g.role));
  if (!roles.has("founder") || !roles.has("pba")) {
    throw new Error("A company cannot go live without a founder and a PBA practitioner on it.");
  }
  const { data: company, error } = await supabase.from("company").update({ status: "live" }).eq("id", companyId).select("id, name").single();
  if (error) throw friendly(error);
  await writeLog(supabase, adminName, { action: "company_live", companyId, companyName: company.name });
  revalidatePath("/", "layout");
}

// Rolls the monthly checklist forward: creates the monthly items for the month that has just ended.
export async function generateMonth(companyId: string) {
  const { supabase, adminName } = await requireAdmin();
  const month = closePeriod();
  await seedChecklist(supabase, companyId, month, "monthly");
  const { data: company } = await supabase.from("company").select("name").eq("id", companyId).single();
  await writeLog(supabase, adminName, { action: "month_generated", companyId, companyName: company?.name, detail: month });
  revalidatePath("/", "layout");
}

// ---------- people ----------

export type PersonRow = {
  id: string;
  name: string | null;
  mobile: string | null;
  email: string;
  accountType: AccountType;
  firm: string | null;
  companies: string[];
  lastSignIn: string | null;
};

export async function listPeople(): Promise<PersonRow[]> {
  const { supabase } = await requireAdmin();
  const [{ data: users }, { data: grants }] = await Promise.all([
    supabase.from("app_user").select("id, name, phone, email, account_type, firm_name, last_login_at").order("created_at"),
    supabase.from("company_access").select("user_id, company:company_id(name)").is("revoked_at", null),
  ]);
  const byUser = new Map<string, string[]>();
  for (const g of (grants ?? []) as unknown as { user_id: string; company: { name: string } | null }[]) {
    if (g.company) byUser.set(g.user_id, [...(byUser.get(g.user_id) ?? []), g.company.name]);
  }
  // People an admin added have a mobile number; anyone without one or without access is an old test account.
  return (users ?? [])
    .filter((u) => u.phone || byUser.has(u.id))
    .map((u) => ({
      id: u.id,
      name: u.name,
      mobile: u.phone,
      email: u.email,
      accountType: (u.account_type ?? "founder") as AccountType,
      firm: u.firm_name,
      companies: u.account_type === "admin" ? ["All companies"] : byUser.get(u.id) ?? [],
      lastSignIn: u.last_login_at,
    }));
}

export async function addPerson(params: {
  name: string;
  mobile: string;
  email: string;
  accountType: AccountType;
  firmName?: string;
  companyId?: string | null;
}) {
  const { supabase, adminName } = await requireAdmin();
  const mobile = normalizePhone(params.mobile);
  if (!params.name.trim()) throw new Error("Give the person a name");
  if (mobile.length !== 12) throw new Error("Enter a 10-digit mobile number");
  if (!/^\S+@\S+\.\S+$/.test(params.email)) throw new Error("Enter an email address — it is only used for notices");
  if (params.accountType === "external" && !params.firmName?.trim()) throw new Error("External practitioners need a firm name — it is shown on everything they upload");
  if (params.accountType === "admin" && DEV_BYPASS_AUTH) throw new Error("PBA admin accounts can only be added once real sign-in is on");

  const { data: person, error } = await supabase
    .from("app_user")
    .insert({
      name: params.name.trim(),
      phone: mobile,
      email: params.email.trim().toLowerCase(),
      account_type: params.accountType,
      role: LEGACY_ROLE[params.accountType],
      firm_name: params.accountType === "external" ? params.firmName!.trim() : null,
      can_verify: params.accountType === "pba" || params.accountType === "admin",
      can_publish: params.accountType === "pba" || params.accountType === "admin",
      company_id: null,
    })
    .select("id, name")
    .single();
  if (error) throw friendly(error);

  if (params.accountType === "admin") {
    const { error: adminError } = await supabase.from("platform_admin").insert({ phone: mobile, name: person.name });
    if (adminError) throw friendly(adminError);
  }
  await writeLog(supabase, adminName, { action: "person_added", targetUserId: person.id, targetName: person.name, detail: params.accountType });

  if (params.companyId && params.accountType !== "admin") {
    await grantAccess(person.id, params.companyId);
  }
  revalidatePath("/", "layout");
  return person.id as string;
}

export async function editPerson(userId: string, params: { name: string; email: string; firmName?: string }) {
  const { supabase, adminName } = await requireAdmin();
  const { data: person, error } = await supabase
    .from("app_user")
    .update({ name: params.name.trim(), email: params.email.trim().toLowerCase(), ...(params.firmName !== undefined ? { firm_name: params.firmName.trim() || null } : {}) })
    .eq("id", userId)
    .select("id, name")
    .single();
  if (error) throw friendly(error);
  await writeLog(supabase, adminName, { action: "person_edited", targetUserId: person.id, targetName: person.name });
  revalidatePath("/", "layout");
}

// ---------- access ----------

export async function grantAccess(userId: string, companyId: string) {
  const { supabase, adminName } = await requireAdmin();
  const [{ data: user }, { data: company }] = await Promise.all([
    supabase.from("app_user").select("id, name, email, account_type").eq("id", userId).single(),
    supabase.from("company").select("id, name").eq("id", companyId).single(),
  ]);
  if (!user || !company) throw new Error("Person or company not found");
  if (!user.account_type || user.account_type === "admin") throw new Error("PBA admins already see every company");

  const role = ROLE_FOR[user.account_type as Exclude<AccountType, "admin">];
  const { error } = await supabase.from("company_access").insert({ user_id: userId, company_id: companyId, role, granted_by_name: adminName });
  if (error) {
    if (error.code === "23505") throw new Error(`${user.name ?? user.email} already has access to ${company.name}`);
    throw friendly(error);
  }
  await writeLog(supabase, adminName, { action: "access_granted", targetUserId: userId, targetName: user.name ?? user.email, companyId, companyName: company.name, detail: role });
  revalidatePath("/", "layout");
}

// Takes effect immediately: the next request this person makes finds no active grant (see current_app_user()).
export async function removeAccess(accessId: string) {
  const { supabase, adminName } = await requireAdmin();
  const { data: row, error } = await supabase
    .from("company_access")
    .update({ revoked_at: new Date().toISOString(), revoked_by_name: adminName })
    .eq("id", accessId)
    .is("revoked_at", null)
    .select("user_id, company_id, role, user:user_id(name, email), company:company_id(name)")
    .single();
  if (error) throw friendly(error);
  const r = row as unknown as { user_id: string; company_id: string; role: string; user: { name: string | null; email: string } | null; company: { name: string } | null };
  await writeLog(supabase, adminName, { action: "access_removed", targetUserId: r.user_id, targetName: r.user?.name ?? r.user?.email, companyId: r.company_id, companyName: r.company?.name, detail: r.role });
  revalidatePath("/", "layout");
}

export type LogRow = { id: string; at: string; who: string; action: string; target: string | null; company: string | null; detail: string | null };

export async function listAccessLog(limit = 60): Promise<LogRow[]> {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("access_log").select("*").order("at", { ascending: false }).limit(limit);
  return (data ?? []).map((l) => ({ id: l.id, at: l.at, who: l.who_name, action: l.action, target: l.target_name, company: l.company_name, detail: l.detail }));
}
