import { pageGate } from "@/lib/gate";
import { closePeriod, currentPeriod, formatPeriodLabel, previousPeriods } from "@/lib/period";
import { listCompanies, getCompanyDetail } from "../actions";
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
    try {
      const detail = await getCompanyDetail(c);
      if (detail) {
        return (
          <>
            <PageHeader title="Companies" sub={detail.company.name} />
            <CompanyDetail {...detail} />
          </>
        );
      }
    } catch (e) {
      return failed(e);
    }
  }

  let companies;
  try {
    companies = await listCompanies();
  } catch (e) {
    return failed(e);
  }
  const periodOptions = [...new Set([currentPeriod(), closePeriod(), previousPeriods(closePeriod(), 2)[0]])].map((p) => ({ value: p, label: formatPeriodLabel(p) }));
  return (
    <>
      <PageHeader title="Companies" sub="Create companies, and see who is on each" />
      <CompaniesAdmin companies={companies} periodOptions={periodOptions} />
    </>
  );
}
