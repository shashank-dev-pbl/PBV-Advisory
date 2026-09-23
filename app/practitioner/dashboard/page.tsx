import { redirect } from "next/navigation";
import { getCurrentAppUser, needsOnboarding, DEV_BYPASS_AUTH } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { currentPeriod } from "@/lib/period";
import { getPublishedHistory } from "@/lib/periodFiguresView";
import PractitionerDashboardView from "./PractitionerDashboardView";
import type { Company } from "@/lib/types";
import DataUnavailable from "../../data-unavailable";

export default async function PractitionerDashboardPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (needsOnboarding(appUser)) redirect("/onboarding");
  if (!DEV_BYPASS_AUTH && appUser.role !== "practitioner") redirect("/");

  const supabase = await createClient();
  const { data: company } = await supabase.from("company").select("*").eq("id", appUser.company_id).single<Company>();
  // A transient Supabase blip (or the free-tier project waking from auto-pause)
  // surfaces here as a null row, not a thrown error. Show a retry message
  // instead of redirecting home — redirecting back into a role's own route
  // just loops, since it would immediately redirect right back here.
  if (!company) return <DataUnavailable />;

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
