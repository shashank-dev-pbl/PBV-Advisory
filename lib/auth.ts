import { createClient } from "@/lib/supabase/server";
import type { AppUser } from "@/lib/types";

// TEMPORARY — dev-only login bypass while phone OTP is blocked on Twilio.
// Skips Supabase Auth entirely; matching anon-role RLS policies on the
// relevant tables/storage bucket were reopened alongside this (see the
// "dev_bypass" migration) so pages can still actually fetch/write data.
// MUST be reverted (set to false, migration rolled back) before Twilio ships
// or before any deploy to main — this exposes Xploro's real data to anyone
// holding the public anon key, not just this app.
export const DEV_BYPASS_AUTH = true;
const DEV_BYPASS_USER: AppUser = {
  id: "8ec4cd6e-e017-46e4-8ea6-e1abc69597d7",
  email: "shashank@primebottomline.vc",
  name: "Shashank",
  position: "Audit Partner",
  role: "practitioner",
  company_id: "646035b7-140d-4a22-9540-67d72f7afa55",
  phone: null,
  auth_user_id: null,
  can_verify: false,
  can_publish: false,
  firm_name: null,
};

// Identity resolution and one-time account-claiming both happen inside the
// current_app_user() SQL function (SECURITY DEFINER) — see the Build 3 phase 1
// migration. There is no auto-registration here anymore: a phone number must
// already exist on an app_user row (provisioned by an admin) or this returns null.
export async function getCurrentAppUser(): Promise<AppUser | null> {
  if (DEV_BYPASS_AUTH) return DEV_BYPASS_USER;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("current_app_user");
  if (error || !data || !(data as AppUser).id) return null;
  return data as AppUser;
}

export function needsOnboarding(user: AppUser): boolean {
  return !user.name || !user.position;
}
