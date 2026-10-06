import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { AppUser, AccountType, CompanyRole } from "@/lib/types";
import { DEV_BYPASS_AUTH } from "@/lib/devBypass";
import { COMPANY_COOKIE, DEV_AS_COOKIE, type Who } from "@/lib/access";

export { DEV_BYPASS_AUTH };

export type CompanyAccess = {
  id: string;
  name: string;
  status: "setting_up" | "live";
  role: CompanyRole | "admin";
};

export type Session = {
  user: AppUser | null; // company_id / role are already resolved for the company they are acting in
  who: Who | null;
  companies: CompanyAccess[];
  company: CompanyAccess | null;
};

const EMPTY: Session = { user: null, who: null, companies: [], company: null };

// While real sign-in is off (DEV_BYPASS_AUTH), these four pre-provisioned accounts stand in for the
// four account types. The dark strip in the app shell picks one via the dev_as cookie. They are
// real rows, so everything downstream — access checks, submitted_by vs published_by — behaves
// exactly as it will with real sign-in.
const DEV_IDENTITIES: Record<Who, AppUser> = {
  founder: devUser("c1e474bf-f2bb-4c1b-8fe4-2b0794f409de", "shashank+founder@primebottomline.vc", "Mahendra", "Founder", "founder", "founder"),
  external: devUser("8ec4cd6e-e017-46e4-8ea6-e1abc69597d7", "shashank@primebottomline.vc", "SPARC & Co", "Accounts desk", "practitioner", "external", "SPARC & Co"),
  pba: devUser("c42a42df-479d-4018-a1df-2dc3332844dd", "swetha@primebottomline.vc", "Swetha", "PBA Reviewer", "pba", "pba"),
  admin: devUser("50b5c239-9216-43b9-af4c-0b4dc022a658", "shashank+admin@primebottomline.vc", "Shashank", "PBA admin", "pba", "admin"),
};

function devUser(
  id: string, email: string, name: string, position: string,
  role: AppUser["role"], account_type: AccountType, firm_name: string | null = null
): AppUser {
  return {
    id, email, name, position, role, account_type, firm_name,
    company_id: "",
    phone: null, auth_user_id: null,
    can_verify: role === "pba", can_publish: role === "pba",
  };
}

// Role as the database policies still spell it: an external practitioner is "practitioner", admin acts as "pba".
function dbRole(role: CompanyRole | "admin"): AppUser["role"] {
  return role === "external" ? "practitioner" : role === "admin" ? "pba" : role;
}

type AccessRow = { role: CompanyRole; company: { id: string; name: string; status: "setting_up" | "live" } | null };

async function loadCompanies(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, isAdmin: boolean): Promise<CompanyAccess[]> {
  if (isAdmin) {
    const { data } = await supabase.from("company").select("id, name, status").order("created_at");
    return (data ?? []).map((c) => ({ ...c, role: "admin" as const }));
  }
  const { data } = await supabase
    .from("company_access")
    .select("role, company:company_id(id, name, status)")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("granted_at");
  return ((data ?? []) as unknown as AccessRow[])
    .filter((r) => r.company)
    .map((r) => ({ ...r.company!, role: r.role }));
}

function pickCompany(companies: CompanyAccess[], selectedId: string | undefined): CompanyAccess | null {
  return companies.find((c) => c.id === selectedId) ?? companies[0] ?? null;
}

export const getSession = cache(async (): Promise<Session> => {
  const jar = await cookies();
  const selectedId = jar.get(COMPANY_COOKIE)?.value;
  const supabase = await createClient();

  if (DEV_BYPASS_AUTH) {
    const asCookie = jar.get(DEV_AS_COOKIE)?.value as Who | undefined;
    const who: Who = asCookie && asCookie in DEV_IDENTITIES ? asCookie : "external";
    const base = DEV_IDENTITIES[who];
    const companies = await loadCompanies(supabase, base.id, who === "admin");
    const company = pickCompany(companies, selectedId);
    const user: AppUser = { ...base, company_id: company?.id ?? "", role: company ? dbRole(company.role) : base.role };
    return { user, who, companies, company };
  }

  let { data } = await supabase.rpc("current_app_user");
  if (!data || !(data as AppUser).id) {
    await supabase.rpc("claim_app_user");
    ({ data } = await supabase.rpc("current_app_user"));
  }
  if (!data || !(data as AppUser).id) return EMPTY;

  const user = data as AppUser;
  const isAdmin = user.account_type === "admin";
  const companies = await loadCompanies(supabase, user.id, isAdmin);
  const company = companies.find((c) => c.id === user.company_id) ?? null;
  const who: Who = isAdmin ? "admin" : company ? (company.role as Who) : ((user.account_type as Who) ?? "founder");
  return { user, who, companies, company };
});

// The signed-in person acting inside a company, or null (not signed in, or no access to any company).
// Server Actions and company-scoped queries use this — never a company id taken from the client.
export async function getCurrentAppUser(): Promise<AppUser | null> {
  const s = await getSession();
  return s.user && s.user.company_id ? s.user : null;
}

export function needsOnboarding(user: AppUser): boolean {
  return !user.name || !user.position;
}
