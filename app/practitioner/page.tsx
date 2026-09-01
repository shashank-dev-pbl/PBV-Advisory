import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentPeriod } from "@/lib/period";
import { getCurrentAppUser } from "@/lib/auth";
import type { Company, DocItem, Deliverable } from "@/lib/types";
import PractitionerView from "./PractitionerView";

export default async function PractitionerPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "practitioner") redirect(appUser.role === "founder" ? "/founder" : "/login");

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

  const { data: deliverables } = await supabase
    .from("deliverable")
    .select("*")
    .eq("company_id", companyId)
    .in("period", ["ONCE", period])
    .order("due_date", { ascending: true });

  return (
    <PractitionerView
      company={company as Company}
      docItems={(docItems ?? []) as DocItem[]}
      deliverables={(deliverables ?? []) as Deliverable[]}
    />
  );
}
