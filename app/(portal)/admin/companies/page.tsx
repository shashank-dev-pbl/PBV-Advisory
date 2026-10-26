import { pageGate } from "@/lib/gate";
import { closePeriod, currentPeriod, formatPeriodLabel, previousPeriods } from "@/lib/period";
import { listCompanies, getCompanyDetail } from "../actions";
import { createClient } from "@/lib/supabase/server";
import { companyOverview } from "@/lib/companies/overview";
import PageHeader from "../../PageHeader";
import Locked from "../../Locked";
import CompaniesAdmin from "./CompaniesAdmin";
import CompanyDetail from "./CompanyDetail";
import AdminError from "../AdminError";

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { session, locked } = await pageGate("companies");
  if (locked) return <Locked page="companies" who={session.who!} />;

  const { c } = await searchParams;
  const failed = (e: unknown) => (
    <>
      <PageHeader title="Companies" sub="Create companies, and see who is on each" />
      <AdminError title="This page could not load" message={e instanceof Error ? e.message : String(e)} />
    </>
  );
  if (c) {
    let detail: Awaited<ReturnType<typeof getCompanyDetail>> = null;
    try {
      detail = await getCompanyDetail(c);
    } catch (e) {
      return failed(e);
    }
    if (detail) {
      return (
        <>
          <PageHeader title="Companies" sub={detail.company.name} />
          <CompanyDetail {...detail} />
        </>
      );
    }
  }

  let companies;
  try {
    companies = await listCompanies();
  } catch (e) {
    return failed(e);
  }
  const rows = await companyOverview(await createClient(), companies.map((c) => c.id));
  const periodOptions = [...new Set([currentPeriod(), closePeriod(), previousPeriods(closePeriod(), 2)[0]])].map((p) => ({ value: p, label: formatPeriodLabel(p) }));
  return (
    <>
      <PageHeader title="Companies" />
      <CompaniesAdmin companies={companies} rows={rows} periodOptions={periodOptions} />
    </>
  );
}
