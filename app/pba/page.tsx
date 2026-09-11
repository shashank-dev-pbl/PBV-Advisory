import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAppUser, needsOnboarding, DEV_BYPASS_AUTH } from "@/lib/auth";
import { currentPeriod } from "@/lib/period";
import type { Company } from "@/lib/types";
import PBAView from "./PBAView";
import { getSubmittedForReview } from "./actions";

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
  // A transient Supabase blip surfaces here as a null row, not a thrown error —
  // bounce home instead of crashing the page on it.
  if (!company) redirect("/");

  const period = currentPeriod();
  const review = await getSubmittedForReview(appUser.company_id, period);

  return (
    <PBAView
      company={company as Company}
      currentUser={{ id: appUser.id, name: appUser.name, position: appUser.position, role: "pba" }}
      period={period}
      review={review}
    />
  );
}
