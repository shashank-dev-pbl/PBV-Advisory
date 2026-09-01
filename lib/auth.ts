import { createClient } from "@/lib/supabase/server";
import type { AppUser } from "@/lib/types";

export async function getCurrentAppUser(): Promise<AppUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const { data } = await supabase
    .from("app_user")
    .select("*")
    .eq("email", user.email.toLowerCase())
    .single();

  return (data as AppUser) ?? null;
}
