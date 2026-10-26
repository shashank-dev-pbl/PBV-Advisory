import { pageGate } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";
import { companyOverview } from "@/lib/companies/overview";
import PageHeader from "../PageHeader";
import Locked from "../Locked";
import CompaniesTable from "../CompaniesTable";

export default async function HomePage() {
  const { session, locked } = await pageGate("home");
  if (locked) return <Locked page="home" who={session.who!} />;
  const supabase = await createClient();
  const rows = await companyOverview(supabase, session.companies.map((c) => c.id));
  return (
    <>
      <PageHeader title="Companies" />
      <CompaniesTable rows={rows} intro={session.who === "external" ? "Companies you close the books for." : "Companies assigned to you."} />
    </>
  );
}
