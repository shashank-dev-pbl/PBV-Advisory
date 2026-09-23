import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAppUser, needsOnboarding } from "@/lib/auth";
import { getObligations } from "./actions";
import YearView from "./YearView";
import type { Company } from "@/lib/types";
import DataUnavailable from "../data-unavailable";

export default async function YearPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (needsOnboarding(appUser)) redirect("/onboarding");

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("company")
    .select("*")
    .eq("id", appUser.company_id)
    .single<Company>();
  // A transient Supabase blip (or the free-tier project waking from auto-pause)
  // surfaces here as a null row, not a thrown error. Show a retry message
  // instead of redirecting home — redirecting back into a role's own route
  // just loops, since it would immediately redirect right back here.
  if (!company) return <DataUnavailable />;

  const obligations = await getObligations(appUser.company_id);

  return (
    <YearView
      company={company as Company}
      currentUser={{ id: appUser.id, name: appUser.name, position: appUser.position, role: appUser.role }}
      obligations={obligations}
      financialYearStart={company?.financial_year_start ?? "2026-04-01"}
    />
  );
}
