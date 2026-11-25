import Link from "next/link";
import { loadOutreach } from "@/lib/outreachServer";
import { STAGES, fmtDay, funnelOf, pct } from "@/lib/outreach";
import Top from "./Top";
import Fail from "./Fail";

function Kpi({ l, v, s, href }: { l: string; v: React.ReactNode; s: string; href?: string }) {
  const inner = <><div className="l">{l}</div><div className="v">{v}</div><div className="s">{s}</div></>;
  return href ? <Link href={href} className="card kpi link">{inner}</Link> : <div className="card kpi">{inner}</div>;
}

export default async function Dashboard() {
  const data = await loadOutreach();
  if (!data.ok) return <><Top title="Dashboard" /><Fail detail={data.detail} /></>;
  const { leads, events, settings: s, today } = data;
  const f = funnelOf(leads);
  const max = Math.max(1, f.discovered);
  const funnel: [string, number][] = [["Discovered (Source 1)", f.discovered], ["Verified", f.verified], ["Connection sent", f.conn], ["Connection accepted", f.accepted], ["Message 1 sent", f.msg1], ["Replied", f.replied], ["Interested", f.interested]];
  const name = new Map(leads.map((l) => [l.id, l.company_name]));
  const feed = [...events].filter((e) => e.queue_id && name.has(e.queue_id)).sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 40);
  const approve = leads.filter((l) => l.stage === "ready" && !l.approved).length;
  const queue = leads.filter((l) => l.stage === "replied").length;
  const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
  return (
    <>
      <Top title="Dashboard" />
      <div className="wrap">
        <div className="banner">Funded companies come in from the tracker, are confirmed by the news, wait for your approval, then get a connection request, Message 1 and two follow-ups from Swetha&apos;s LinkedIn. A reply stops the sequence and lands in her queue.</div>
        <div className="grid k4">
          <Kpi l="Needs Swetha" v={queue} s="Replies waiting for a human" href="/outreach/queue" />
          <Kpi l="To approve" v={approve} s="Verified companies not yet sent" href="/outreach/pipeline" />
          <Kpi l="Acceptance rate" v={pct(f.accepted, f.conn)} s={`${f.accepted} of ${f.conn} invites accepted`} />
          <Kpi l="Reply rate" v={pct(f.replied, f.msg1)} s={`${f.replied} replies from ${f.msg1} conversations`} />
        </div>
        <div className="grid k2" style={{ marginTop: 14 }}>
          <div className="card funnel"><h3>Funnel (all time)</h3>
            {funnel.map(([l, v]) => <div className="row" key={l}><span>{l}</span><div className="bar"><i style={{ width: `${(v / max) * 100}%` }} /></div><b>{v}</b></div>)}
            <p className="muted" style={{ fontSize: 12, margin: "10px 0 0" }}>Verified → contacted conversion {pct(f.conn, f.verified)}. Interested from replies {pct(f.interested, f.replied)}.</p>
          </div>
          <div className="card"><h3>Today&apos;s sending limits</h3>
            <div className="cap"><div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span>Connection requests</span><span>{today.conn} / {s.cfg.connCap}</span></div><div className="bar"><i style={{ width: `${Math.min(100, (today.conn / Math.max(1, s.cfg.connCap)) * 100)}%` }} /></div></div>
            <div className="cap"><div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span>Messages</span><span>{today.msg} / {s.cfg.msgCap}</span></div><div className="bar"><i style={{ width: `${Math.min(100, (today.msg / Math.max(1, s.cfg.msgCap)) * 100)}%` }} /></div></div>
            <p className="muted" style={{ fontSize: 12.5 }}>Sending window {hh(s.cfg.sendFrom)}–{hh(s.cfg.sendTo)} IST, Mon–Sat. Random gap of {Math.round(s.cfg.gapMinSec / 60)}–{Math.round(s.cfg.gapMaxSec / 60)} min. Limits are kept low on purpose to protect Swetha&apos;s LinkedIn account.</p>
            <h3 style={{ marginTop: 16 }}>Where things are now</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{STAGES.map((st) => <span className="tag" key={st.id}>{st.label}: {leads.filter((l) => l.stage === st.id).length}</span>)}</div>
          </div>
        </div>
        <div className="card" style={{ marginTop: 14 }}><h3>Activity</h3>
          <div className="feed">
            {feed.length ? feed.map((e) => <div key={e.id}><small>{fmtDay(e.at)}</small><Link href={`/outreach/pipeline?lead=${e.queue_id}`}><b>{name.get(e.queue_id!)}</b></Link> – {e.detail}</div>) : <div className="empty">No activity yet</div>}
          </div>
        </div>
      </div>
    </>
  );
}
