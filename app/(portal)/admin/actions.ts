"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { DEV_BYPASS_AUTH } from "@/lib/devBypass";
import { guarded } from "@/lib/actionResult";
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

const POSITION_FOR: Record<AccountType, string> = { founder: "Founder", external: "External practitioner", pba: "PBA practitioner", admin: "PBA admin" };
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

async function _createCompany(params: {
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
  const [{ data: companies, error: companiesError }, { data: grants, error: accessError }] = await Promise.all([
    supabase.from("company").select("id, name, plan, status, financial_year_start, books_by").order("created_at"),
    supabase.from("company_access").select("company_id, role, user:user_id(name, email, firm_name)").is("revoked_at", null),
  ]);
  if (companiesError) throw new Error(`Could not load companies: ${companiesError.message}`);
  if (accessError) throw new Error(`Could not load access: ${accessError.message}`);
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
    .neq("account_type", "founder")
    .order("name");
  const addable = (everyone ?? [])
    .filter((u) => !onIt.has(u.id) && u.account_type)
    .map((u) => ({ id: u.id, label: `${u.name ?? u.email}${u.phone ? "" : " (no mobile yet)"}`, accountType: u.account_type as AccountType }));

  const { count: monthlyCount } = await supabase
    .from("doc_item")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("cadence", "monthly")
    .eq("period", closePeriod());

  return { company, people, addable, monthlyReady: (monthlyCount ?? 0) > 0, closeMonth: closePeriod() };
}

async function _goLive(companyId: string) {
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

// The plan is the engagement letter the company signed (Starter, Builder or Operator). Recorded in the history.
async function _setPlan(companyId: string, plan: "starter" | "builder" | "operator") {
  const { supabase, adminName } = await requireAdmin();
  if (!["starter", "builder", "operator"].includes(plan)) throw new Error("Choose a plan");
  const { data: before } = await supabase.from("company").select("name, plan").eq("id", companyId).single();
  if (!before) throw new Error("Company not found");
  if (before.plan === plan) return;
  const { error } = await supabase.from("company").update({ plan }).eq("id", companyId);
  if (error) throw friendly(error);
  await writeLog(supabase, adminName, { action: "company_plan_changed", companyId, companyName: before.name, detail: `${before.plan}>${plan}` });
  revalidatePath("/", "layout");
}

// Rolls the monthly checklist forward: creates the monthly items for the month that has just ended.
async function _generateMonth(companyId: string) {
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
  const [{ data: users, error: usersError }, { data: grants, error: grantsError }] = await Promise.all([
    supabase.from("app_user").select("id, name, phone, email, account_type, firm_name, last_login_at").order("created_at"),
    supabase.from("company_access").select("user_id, company:company_id(name)").is("revoked_at", null),
  ]);
  // Show a failed query as an error instead of an empty table that looks like "nobody is here".
  if (usersError) throw new Error(`Could not load people: ${usersError.message}`);
  if (grantsError) throw new Error(`Could not load access: ${grantsError.message}`);
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

async function _addPerson(params: {
  name: string;
  mobile: string;
  email: string;
  accountType: AccountType;
  firmName?: string;
  companyId?: string | null;
}) {
  const { supabase, adminName } = await requireAdmin();
  const mobile = normalizePhone(params.mobile);
  if (params.accountType === "founder") throw new Error("Founders are added by mobile number from the company's own page, not here");
  if (!params.name.trim()) throw new Error("Give the person a name");
  if (mobile.length !== 12) throw new Error("Enter a 10-digit mobile number");
  const email = params.email.trim().toLowerCase();
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new Error("That email address doesn't look right. It is optional: leave it empty if they have none.");
  if (params.accountType === "external" && !params.firmName?.trim()) throw new Error("External practitioners need a firm name — it is shown on everything they upload");
  if (params.accountType === "admin" && DEV_BYPASS_AUTH) throw new Error("PBA admin accounts can only be added once real sign-in is on");

  const { data: person, error } = await supabase
    .from("app_user")
    .insert({
      name: params.name.trim(),
      phone: mobile,
      email: email || null,
      account_type: params.accountType,
      position: POSITION_FOR[params.accountType],
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
    await _grantAccess(person.id, params.companyId);
  }
  revalidatePath("/", "layout");
  return person.id as string;
}

async function _editPerson(userId: string, params: { name: string; email: string; firmName?: string; accountType?: AccountType }) {
  const { supabase, adminName } = await requireAdmin();
  const email = params.email.trim().toLowerCase();
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new Error("That email address doesn't look right. It is optional: leave it empty if they have none.");

  const { data: before } = await supabase.from("app_user").select("id, name, phone, account_type, firm_name").eq("id", userId).single();
  if (!before) throw new Error("Person not found");
  const from = before.account_type as AccountType;
  const to = (params.accountType ?? from) as AccountType;
  const patch: Record<string, unknown> = { name: params.name.trim(), email: email || null };

  if (to !== from) {
    if (to === "admin" && DEV_BYPASS_AUTH) throw new Error("PBA admin accounts can only be set once real sign-in is on");
    if (to === "admin" && !before.phone) throw new Error("An admin needs a mobile number to sign in");
    if (from === "admin" && to !== "admin") {
      // The last admin cannot be demoted: the portal would have no one to run it.
      const { count } = await supabase.from("platform_admin").select("*", { count: "exact", head: true });
      if ((count ?? 0) <= 1) throw new Error("This is the last PBA admin. Make someone else an admin first.");
    }
    Object.assign(patch, {
      account_type: to,
      role: LEGACY_ROLE[to],
      position: POSITION_FOR[to],
      can_verify: to === "pba" || to === "admin",
      can_publish: to === "pba" || to === "admin",
    });
  }
  const firm = params.firmName !== undefined ? params.firmName.trim() : (before.firm_name ?? "");
  if (to === "external") {
    if (!firm) throw new Error("External practitioners need a firm name — it is shown on everything they upload");
    patch.firm_name = firm;
  } else if (to !== from || params.firmName !== undefined) {
    patch.firm_name = null;
  }

  const { data: person, error } = await supabase.from("app_user").update(patch).eq("id", userId).select("id, name").single();
  if (error) throw friendly(error);

  if (to !== from) {
    if (to === "admin") {
      const { error: pErr } = await supabase.from("platform_admin").upsert({ phone: before.phone, name: person.name ?? "Admin" }, { onConflict: "phone" });
      if (pErr) throw friendly(pErr);
    } else if (from === "admin" && before.phone) {
      await supabase.from("platform_admin").delete().eq("phone", before.phone);
    }
    // Their role on every company they are on follows the new type.
    if (to !== "admin") {
      await supabase.from("company_access").update({ role: ROLE_FOR[to as Exclude<AccountType, "admin">] }).eq("user_id", userId).is("revoked_at", null);
    }
  }
  await writeLog(supabase, adminName, {
    action: "person_edited", targetUserId: person.id, targetName: person.name,
    detail: to !== from ? `${from}>${to}` : undefined,
  });
  revalidatePath("/", "layout");
}

// ---------- access ----------

async function _grantAccess(userId: string, companyId: string, chosenRole?: CompanyRole) {
  const { supabase, adminName } = await requireAdmin();
  const [{ data: user }, { data: company }] = await Promise.all([
    supabase.from("app_user").select("id, name, email, account_type").eq("id", userId).single(),
    supabase.from("company").select("id, name").eq("id", companyId).single(),
  ]);
  if (!user || !company) throw new Error("Person or company not found");
  if (!user.account_type || user.account_type === "admin") throw new Error("PBA admins already see every company");

  const role: CompanyRole = chosenRole ?? ROLE_FOR[user.account_type as Exclude<AccountType, "admin">];
  if (!["founder", "external", "pba"].includes(role)) throw new Error("Choose a role");
  const { error } = await supabase.from("company_access").insert({ user_id: userId, company_id: companyId, role, granted_by_name: adminName });
  if (error) {
    if (error.code === "23505") throw new Error(`${user.name ?? user.email} already has access to ${company.name}`);
    throw friendly(error);
  }
  await writeLog(supabase, adminName, { action: "access_granted", targetUserId: userId, targetName: user.name ?? user.email, companyId, companyName: company.name, detail: role });
  revalidatePath("/", "layout");
}

// A founder is added to a company by mobile number alone. When they sign in with that number the app finds
// the company they were added to and sends the code; a number with no company is turned away at sign-in.
async function _addFounder(companyId: string, mobileInput: string, name?: string) {
  const { supabase } = await requireAdmin();
  const mobile = normalizePhone(mobileInput);
  if (mobile.length !== 12) throw new Error("Enter the founder's 10-digit mobile number");
  const { data: existing } = await supabase.from("app_user").select("id, account_type").eq("phone", mobile).maybeSingle();
  if (existing && existing.account_type !== "founder") throw new Error("That number already belongs to a practitioner or admin account. A founder needs their own number.");
  let userId = existing?.id as string | undefined;
  if (!userId) {
    const { data: created, error } = await supabase
      .from("app_user")
      .insert({ phone: mobile, name: name?.trim() || null, account_type: "founder", position: "Founder", role: "founder", can_verify: false, can_publish: false, company_id: null })
      .select("id")
      .single();
    if (error) throw friendly(error);
    userId = created.id as string;
  }
  await _grantAccess(userId, companyId, "founder");
}

// Takes effect immediately: the next request this person makes finds no active grant (see current_app_user()).
async function _removeAccess(accessId: string) {
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

// Exported actions return their reason instead of throwing, so the message survives a production build.
export async function createCompany(...args: Parameters<typeof _createCompany>) { return guarded(() => _createCompany(...args)); }
export async function goLive(...args: Parameters<typeof _goLive>) { return guarded(() => _goLive(...args)); }
export async function generateMonth(...args: Parameters<typeof _generateMonth>) { return guarded(() => _generateMonth(...args)); }
export async function addPerson(...args: Parameters<typeof _addPerson>) { return guarded(() => _addPerson(...args)); }
export async function editPerson(...args: Parameters<typeof _editPerson>) { return guarded(() => _editPerson(...args)); }
export async function addFounder(...args: Parameters<typeof _addFounder>) { return guarded(() => _addFounder(...args)); }
export async function grantAccess(...args: Parameters<typeof _grantAccess>) { return guarded(() => _grantAccess(...args)); }
export async function removeAccess(...args: Parameters<typeof _removeAccess>) { return guarded(() => _removeAccess(...args)); }
export async function setPlan(...args: Parameters<typeof _setPlan>) { return guarded(() => _setPlan(...args)); }
