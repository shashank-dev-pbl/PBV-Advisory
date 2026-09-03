import { createClient } from "@/lib/supabase/server";
import type { AppUser } from "@/lib/types";

export async function getCurrentAppUser(): Promise<AppUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const email = user.email.toLowerCase();

  const { data: existing } = await supabase
    .from("app_user")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (existing) return existing as AppUser;

  // Anyone who completes the magic-link flow becomes a real app_user on first login —
  // per explicit product decision for now ("anyone can login"), no allow-list yet. Single
  // company for the moment, so new users are attached to whichever company exists.
  const { data: company } = await supabase.from("company").select("id").limit(1).single();
  if (!company) return null;

  const { data: created } = await supabase
    .from("app_user")
    .insert({ email, name: email.split("@")[0], role: "founder", company_id: company.id })
    .select("*")
    .single();

  return (created as AppUser) ?? null;
}
