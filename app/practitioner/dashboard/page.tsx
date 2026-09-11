import { redirect } from "next/navigation";
import { getCurrentAppUser, needsOnboarding, DEV_BYPASS_AUTH } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { currentPeriod } from "@/lib/period";
import { getPublishedHistory } from "@/lib/periodFiguresView";
import PractitionerDashboardView from "./PractitionerDashboardView";
import type { Company } from "@/lib/types";

export default async function PractitionerDashboardPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (needsOnboarding(appUser)) redirect("/onboarding");
  if (!DEV_BYPASS_AUTH && appUser.role !== "practitioner") redirect("/");

  const supabase = await createClient();
  const { data: company } = await supabase.from("company").select("*").eq("id", appUser.company_id).single<Company>();
  // A transient Supabase blip surfaces here as a null row, not a thrown error —
  // bounce home instead of crashing the page on it.
  if (!company) redirect("/");

  const period = currentPeriod();
  const history = await getPublishedHistory(appUser.company_id, period, 6);

  return (
    <PractitionerDashboardView
      company={company as Company}
      period={period}
      history={history}
      currentUser={{ id: appUser.id, name: appUser.name, position: appUser.position, role: "practitioner" }}
    />
  );
}
