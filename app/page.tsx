import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { getCurrentAppUser } from "@/lib/auth";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) redirect("/login");

  const appUser = await getCurrentAppUser();
  if (appUser) redirect(appUser.role === "practitioner" ? "/practitioner" : "/founder");
  if (isAdminEmail(user.email)) redirect("/admin");
  redirect("/login");
}
