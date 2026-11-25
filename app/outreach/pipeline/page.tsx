import { loadOutreach } from "@/lib/outreachServer";
import Top from "../Top";
import Fail from "../Fail";
import Pipeline from "../Pipeline";
import AddLead from "../AddLead";

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const [sp, data] = await Promise.all([searchParams, loadOutreach()]);
  if (!data.ok) return <><Top title="Pipeline" /><Fail detail={data.detail} /></>;
  const lead = Number(sp.lead);
  return (
    <>
      <Top title="Pipeline" />
      <div className="wrap" style={{ paddingBottom: 0 }}><div className="ptools" style={{ marginBottom: 0 }}><AddLead /></div></div>
      <Pipeline leads={data.leads} hits={data.hits} events={data.events} settings={data.settings} openId={Number.isFinite(lead) && lead > 0 ? lead : null} />
    </>
  );
}
