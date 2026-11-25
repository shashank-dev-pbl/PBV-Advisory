import { loadOutreach } from "@/lib/outreachServer";
import { SOURCES } from "@/lib/outreach";
import { aiConfigured } from "@/lib/outreachAi";
import Top from "../Top";
import Fail from "../Fail";
import AddLead from "../AddLead";

const yes = (ok: boolean) => <span className={`tag ${ok ? "good" : "warn"}`}>{ok ? "Set" : "Not set"}</span>;

export default async function SourcesPage() {
  const data = await loadOutreach();
  if (!data.ok) return <><Top title="Sources" /><Fail detail={data.detail} /></>;
  const count = (id: string) => data.hits.filter((h) => h.source === id).length;
  return (
    <>
      <Top title="Sources" />
      <div className="wrap">
        <div className="card" style={{ marginBottom: 14 }}><h3>Sources</h3>
          <table><thead><tr><th>Source</th><th>Role</th><th>How we read it</th><th>Counts as</th><th>Companies matched</th></tr></thead>
            <tbody>{SOURCES.map((s) => <tr key={s.id}><td><b>{s.name}</b></td><td>{s.role}</td><td>{s.method}</td><td>{s.weight}</td><td>{count(s.id)}</td></tr>)}</tbody></table>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>Add more verification sources (VCCircle, Economic Times, Tracxn if licensed) without changing the flow – each one just adds a ✓.</p></div>

        <div className="grid k2">
          <div className="card"><h3>How a match is decided</h3><ol style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            <li>Company name normalised (drop Pvt Ltd, Technologies, punctuation) and matched against the article headline.</li>
            <li>The article must be about funding, and published within 21 days of the Source 1 date.</li>
            <li>Amount within ±15% after converting $ and ₹ at the rate on the Rules page.</li>
            <li>Any conflict (a different amount) is flagged on the company for a look instead of auto-verifying.</li>
            <li>A company or investor post can be confirmed by hand on the company.</li></ol></div>
          <div className="card"><h3>What we store from each source</h3><div style={{ fontSize: 13 }}>Company name, website, round, amount, investors, announcement date, article link and text (for the AI line), and the date we found it. Article links show on each company so Swetha can check before approving.</div></div>
        </div>

        <div className="card" style={{ marginTop: 14 }}><h3>Set-up on this deployment</h3>
          <table><tbody>
            <tr><td><span className="mono">OUTREACH_SOURCE1_URL</span></td><td>{yes(!!process.env.OUTREACH_SOURCE1_URL)}</td><td>The funding tracker file (CSV or JSON). Without it nothing is discovered automatically; add companies by hand below.</td></tr>
            <tr><td><span className="mono">OUTREACH_API_KEY</span></td><td>{yes(!!(process.env.OUTREACH_KEY || process.env.OUTREACH_API_KEY))}</td><td>The same key the extension uses. The scan needs it to read and update companies.</td></tr>
            <tr><td><span className="mono">CRON_SECRET</span></td><td>{yes(!!process.env.CRON_SECRET)}</td><td>Lets the daily scan run by itself (production only). &ldquo;Run scan now&rdquo; works without it.</td></tr>
            <tr><td><span className="mono">ANTHROPIC_API_KEY</span></td><td>{yes(aiConfigured())}</td><td>Writes the company line and labels replies. Without it, write the line by hand; replies are labelled by simple rules.</td></tr>
          </tbody></table></div>

        <div className="ptools" style={{ marginTop: 14 }}><AddLead /></div>
      </div>
    </>
  );
}
