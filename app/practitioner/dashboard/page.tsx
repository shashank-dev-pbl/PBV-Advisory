import { redirect } from "next/navigation";
import { getCurrentAppUser, needsOnboarding } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { currentPeriod } from "@/lib/period";
import { getFinancialsHistory, getFinancialsForPeriod } from "../financials-actions";
import PractitionerDashboardView from "./PractitionerDashboardView";
import type { Company } from "@/lib/types";

export default async function PractitionerDashboardPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (needsOnboarding(appUser)) redirect("/onboarding");
  if (appUser.role !== "practitioner") redirect("/");

  const supabase = await createClient();
  const { data: company } = await supabase.from("company").select("*").eq("id", appUser.company_id).single<Company>();

  const period = currentPeriod();
  const [history, existing] = await Promise.all([
    getFinancialsHistory(appUser.company_id, period, 6),
    getFinancialsForPeriod(appUser.company_id, period),
  ]);

  return (
    <PractitionerDashboardView
      company={company as Company}
      period={period}
      existing={existing}
      history={history}
      currentUser={{ name: appUser.name, position: appUser.position, role: "practitioner" }}
    />
  );
}
