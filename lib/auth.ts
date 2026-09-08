import { createClient } from "@/lib/supabase/server";
import type { AppUser } from "@/lib/types";

// Identity resolution and one-time account-claiming both happen inside the
// current_app_user() SQL function (SECURITY DEFINER) — see the Build 3 phase 1
// migration. There is no auto-registration here anymore: a phone number must
// already exist on an app_user row (provisioned by an admin) or this returns null.
export async function getCurrentAppUser(): Promise<AppUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("current_app_user");
  if (error || !data || !(data as AppUser).id) return null;
  return data as AppUser;
}

export function needsOnboarding(user: AppUser): boolean {
  return !user.name || !user.position;
}
