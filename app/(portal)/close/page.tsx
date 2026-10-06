import { pageGate } from "@/lib/gate";
import { closePeriod, formatPeriodLabel } from "@/lib/period";
import { getMisState } from "@/app/practitioner/mis-actions";
import { listMonths, getReview } from "@/app/pba/actions";
import MisUploadCard from "@/app/practitioner/MisUploadCard";
import CloseReview from "@/app/pba/CloseReview";
import PageHeader from "../PageHeader";
import Locked from "../Locked";
import NoCompany from "../NoCompany";
import SettingUp from "../SettingUp";

export default async function ClosePage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { session, locked } = await pageGate("close");
  if (locked) return <Locked page="close" who={session.who!} />;
  const company = session.company;
  if (!company) return <NoCompany page="close" admin={session.who === "admin"} />;
  if (company.status === "setting_up") return <SettingUp page={"close"} name={company.name} />;
  const user = session.user!;
  const period = closePeriod();

  // External practitioner: upload this month's workbook and submit it. They never check or publish.
  if (session.who === "external") {
    const misState = await getMisState(company.id, period);
    return (
      <>
        <PageHeader title={company.name} accent="Monthly close" sub={formatPeriodLabel(period)} />
        <div className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8">
          <div className="mb-6 p-4" style={{ background: "#eef3ec", border: "1px solid #cfdccd" }}>
            <p className="text-[13px]" style={{ color: "#22452a" }}>
              <strong>You upload; Prime Bottomline checks and publishes.</strong> Nothing here reaches the founder until they do.
            </p>
          </div>
          <MisUploadCard companyId={company.id} period={period} initial={misState} />
          <h2 className="mb-3 mt-10 text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--ink)" }}>What happens to a file you upload</h2>
          <table className="w-full" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderCollapse: "collapse" }}>
            <tbody>
              {[
                ["Wrong template version", "Refused, with the version it found"],
                ["One of the workbook's five checks fails", "Refused, naming the check"],
                ["Any figure is an error, not a number", "Refused, naming the figure"],
                ["Month has not ended yet", "Refused until the 1st of next month"],
              ].map(([a, b]) => (
                <tr key={a} style={{ borderBottom: "1px solid var(--rule)" }}>
                  <td className="px-3 py-2.5 text-[13px]" style={{ color: "var(--ink)" }}>{a}</td>
                  <td className="px-3 py-2.5 text-[13px]" style={{ color: "var(--ink-secondary)" }}>{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  // PBA practitioner and admin: every month, whatever state it is in.
  const { m } = await searchParams;
  const months = await listMonths();
  const selected = months.find((x) => x.id === m) ?? months.find((x) => x.state === "submitted") ?? months[0] ?? null;
  const review = selected ? await getReview(selected.id) : null;
  return (
    <>
      <PageHeader title={company.name} accent="Monthly close" sub="Every month — submitted, published and sent back" />
      <CloseReview months={months} selectedId={selected?.id ?? null} review={review} currentUserId={user.id} />
    </>
  );
}
