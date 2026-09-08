import { createClient } from "@/lib/supabase/server";

// Ops console access — platform staff only, independent of any company's app_user
// rows. Backed by the platform_admin table (see is_platform_admin() in the DB),
// checked against the caller's own verified phone, not a hardcoded list.
export async function isCurrentUserPlatformAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error) return false;
  return data === true;
}
