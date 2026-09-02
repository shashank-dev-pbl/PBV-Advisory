import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { AppUser } from "@/lib/types";

export async function getCurrentAppUser(): Promise<AppUser | null> {
  // The middleware already verified the session with Supabase Auth (a network round-trip)
  // and forwarded the result via this header — reading it here avoids paying that same
  // round-trip a second time on every page load.
  const headerList = await headers();
  const email = headerList.get("x-verified-user-email");
  if (!email) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("app_user")
    .select("*")
    .eq("email", email.toLowerCase())
    .single();

  return (data as AppUser) ?? null;
}
