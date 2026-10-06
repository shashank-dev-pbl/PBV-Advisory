import { getCurrentAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AppUser, Role } from "@/lib/types";

// The person, acting inside a company they actually have access to. Every Server Action starts here
// (usually via requireRole), so a locked page and a direct call are refused the same way.
export async function requireAppUser(): Promise<AppUser> {
  const user = await getCurrentAppUser();
  if (!user) throw new Error("Not signed in, or no access to a company");
  return user;
}

export async function requireRole(...roles: Role[]): Promise<AppUser> {
  const user = await requireAppUser();
  if (!roles.includes(user.role)) throw new Error("You don't have access to this action");
  return user;
}

// Role check plus "this checklist item belongs to the company you are acting in" — an id from the
// browser is never trusted on its own.
export async function requireItem(docItemId: string, ...roles: Role[]) {
  const appUser = await requireRole(...roles);
  const supabase = await createClient();
  const { data } = await supabase.from("doc_item").select("id, company_id").eq("id", docItemId).maybeSingle();
  if (!data || data.company_id !== appUser.company_id) throw new Error("You don't have access to this item");
  return { appUser, supabase };
}
