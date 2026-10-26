import Link from "next/link";
import "../proto.css";
import { fmtDate } from "@/lib/dates";
import { pageGate } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";
import PageHeader from "../PageHeader";
import Locked from "../Locked";
import NoCompany from "../NoCompany";
import SettingUp from "../SettingUp";

const monthName = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

// Everything Prime Bottomline has delivered, with the date. Published months today; finished legal documents once Legal is live.
export default async function FilesPage() {
  const { session, locked } = await pageGate("files");
  if (locked) return <Locked page="files" who={session.who!} />;
  const company = session.company;
  if (!company) return <NoCompany page="files" admin={session.who === "admin"} />;
  if (company.status === "setting_up") return <SettingUp page="files" name={company.name} />;

  const supabase = await createClient();
  const { data, error } = await supabase.from("month").select("period, published_at, published_by_name").eq("company_id", company.id).not("published_at", "is", null).order("period", { ascending: false });
  const months = data ?? [];
  const legal = session.who === "external" ? { data: [] } : await supabase.from("legal_request").select("id, title, delivered_at, ready_filename").eq("company_id", company.id).eq("status", "done").order("delivered_at", { ascending: false });
  const docs = legal.data ?? [];
  return (
    <>
      <PageHeader title={company.name} accent="Files delivered" />
      <div className="p5">
        <div className="content" style={{ padding: "18px 22px" }}>
          {error ? <div className="phold">Could not load: {error.message}</div> : months.length === 0 && docs.length === 0 ? (
            <div className="phold"><b>Nothing delivered yet.</b><br />Published months and finished legal documents appear here, with the date they were delivered.</div>
          ) : (
            <>
              <div className="lintro">Everything Prime Bottomline has delivered, in one place, with the date. Nothing is removed from here.</div>
              {docs.length > 0 && <><div className="gh"><h3>Legal documents</h3></div>
                <div className="tw"><table className="dt ctab"><thead><tr><th>Delivered</th><th>Document</th><th>From</th><th /></tr></thead>
                  <tbody>{docs.map((d) => <tr key={d.id as string}><td>{fmtDate(d.delivered_at as string)}</td><td><b>{(d.ready_filename as string) ?? (d.title as string)}</b></td><td>Legal · {d.id as string}</td><td><Link className="lnk" href={`/legal?r=${d.id}`}>Open</Link></td></tr>)}</tbody></table></div></>}
              <div className="gh"><h3>Monthly figures</h3><span className="gsrc">{months.length} published month{months.length === 1 ? "" : "s"}</span></div>
              <div className="tw">
                <table className="dt ctab">
                  <thead><tr><th>Delivered</th><th>Document</th><th>From</th><th /></tr></thead>
                  <tbody>{months.map((m) => (
                    <tr key={m.period as string}>
                      <td>{fmtDate(m.published_at as string)}</td><td><b>Monthly figures and review — {monthName(m.period as string)}</b></td><td>Monthly close</td>
                      <td><Link className="lnk" href={`/dashboard?m=${m.period}`}>Open</Link></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
