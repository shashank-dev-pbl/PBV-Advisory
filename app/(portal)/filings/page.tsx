import { pageGate } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";
import { getObligations } from "@/app/year/actions";
import YearView from "@/app/year/YearView";
import PageHeader from "../PageHeader";
import Locked from "../Locked";
import NoCompany from "../NoCompany";

export default async function FilingsPage() {
  const { session, locked } = await pageGate("filings");
  if (locked) return <Locked page="filings" who={session.who!} />;
  const company = session.company;
  const user = session.user!;
  if (!company) return <NoCompany page="filings" admin={session.who === "admin"} />;

  const supabase = await createClient();
  const [{ data: row }, obligations] = await Promise.all([
    supabase.from("company").select("financial_year_start").eq("id", company.id).single(),
    getObligations(company.id),
  ]);

  return (
    <>
      <PageHeader title={company.name} accent="Filings" sub="A filing cannot be closed without its evidence attached. PBA verifies each one." />
      <div className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8">
        <YearView
          company={{ id: company.id, name: company.name }}
          currentUser={{ id: user.id, name: user.name, position: user.position, role: user.role }}
          obligations={obligations}
          financialYearStart={row?.financial_year_start ?? "2026-04-01"}
        />
      </div>
    </>
  );
}
