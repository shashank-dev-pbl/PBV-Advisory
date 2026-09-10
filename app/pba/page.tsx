import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAppUser, needsOnboarding, DEV_BYPASS_AUTH } from "@/lib/auth";
import type { Company } from "@/lib/types";
import PBAView from "./PBAView";

export default async function PBAPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (needsOnboarding(appUser)) redirect("/onboarding");
  if (!DEV_BYPASS_AUTH && appUser.role !== "pba") redirect("/");

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("company")
    .select("*")
    .eq("id", appUser.company_id)
    .single<Company>();

  return (
    <PBAView
      company={company as Company}
      currentUser={{ name: appUser.name, position: appUser.position, role: "pba" }}
    />
  );
}
