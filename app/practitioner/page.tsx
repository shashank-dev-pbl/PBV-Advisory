import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentPeriod } from "@/lib/period";
import { getCurrentAppUser, needsOnboarding, DEV_BYPASS_AUTH } from "@/lib/auth";
import type { Company, DocItem, Deliverable } from "@/lib/types";
import PractitionerView from "./PractitionerView";
import { getMisState } from "./mis-actions";
import type { Obligation } from "@/lib/types";

export default async function PractitionerPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (needsOnboarding(appUser)) redirect("/onboarding");
  if (!DEV_BYPASS_AUTH && appUser.role !== "practitioner") redirect("/");

  const supabase = await createClient();
  const companyId = appUser.company_id;

  const { data: company } = await supabase
    .from("company")
    .select("*")
    .eq("id", companyId)
    .single<Company>();

  const period = currentPeriod();

  const { data: docItems } = await supabase
    .from("doc_item")
    .select("*, doc_file(*), doc_item_message(*)")
    .eq("company_id", companyId)
    .in("period", ["ONCE", period])
    .order("requested_at", { ascending: true });

  const { data: teamUsers } = await supabase
    .from("app_user")
    .select("id, name, role")
    .eq("company_id", companyId);

  const { data: deliverables } = await supabase
    .from("deliverable")
    .select("*")
    .eq("company_id", companyId)
    .in("period", ["ONCE", period])
    .order("due_date", { ascending: true });

  const misState = await getMisState(companyId, period);

  // The filings table on the desk is this month's practitioner-owned work only —
  // the full multi-year calendar lives on /year.
  const { data: filings } = await supabase
    .from("obligation")
    .select("*")
    .eq("company_id", companyId)
    .eq("period", period)
    .eq("owner", "practitioner")
    .order("statutory_due_date", { ascending: true });

  return (
    <PractitionerView
      company={company as Company}
      docItems={(docItems ?? []) as DocItem[]}
      deliverables={(deliverables ?? []) as Deliverable[]}
      currentUser={{ id: appUser.id, name: appUser.name, position: appUser.position, role: "practitioner" }}
      period={period}
      misState={misState}
      filings={(filings ?? []) as Obligation[]}
      teamUsers={teamUsers ?? []}
    />
  );
}
