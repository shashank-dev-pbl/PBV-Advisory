import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isCurrentUserPlatformAdmin } from "@/lib/admin";
import { getCurrentAppUser, needsOnboarding, DEV_BYPASS_AUTH } from "@/lib/auth";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!DEV_BYPASS_AUTH && !user) redirect("/login");

  const appUser = await getCurrentAppUser();
  if (appUser) {
    if (needsOnboarding(appUser)) redirect("/onboarding");
    if (appUser.role === "practitioner") redirect("/practitioner");
    if (appUser.role === "pba") redirect("/pba");
    redirect("/founder");
  }
  if (await isCurrentUserPlatformAdmin()) redirect("/admin");
  redirect("/login");
}
