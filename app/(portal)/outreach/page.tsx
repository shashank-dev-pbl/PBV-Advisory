import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { pageGate } from "@/lib/gate";
import { fmtDate } from "@/lib/dates";
import { FUNNEL, SIDE_EXITS, STAGE_LABEL, lastMove, loadOutreach } from "@/lib/outreach";
import PageHeader from "../PageHeader";
import Locked from "../Locked";

const box = { background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 10 } as const;
// "Active" is everything the bot has actually touched; Queued and Skipped are the long tail.
const ACTIVE = ["founder_found", "connect_sent", "accepted", "dm_sent", "replied", "needs_review", "no_founder", "cannot_connect", "stale"];

export default async function OutreachPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { session, locked } = await pageGate("outreach");
  if (locked) return <Locked page="outreach" who={session.who!} />;

  const sp = await searchParams;
  const all = [...FUNNEL, ...SIDE_EXITS] as string[];
  const stage = sp.s && all.includes(sp.s) ? sp.s : "active";
  const data = await loadOutreach(stage === "active" ? ACTIVE : [stage]);

  return (
    <>
      <PageHeader title="Outreach" accent="LinkedIn leads" sub="Read-only. The LinkedIn bot finds, connects and messages; replies are for the team to follow up." />
      <div className="mx-auto w-full max-w-[1280px] px-5 py-6 md:px-8">
        {!data.ok ? (
          <div className="p-4 text-[13px]" style={{ background: "#fbe9e7", border: "1px solid #e3b8b2", color: "#8c1a1a" }}>
            {data.reason === "not_configured"
              ? "Outreach is not connected yet. Set OUTREACH_API_URL and OUTREACH_API_KEY on this deployment."
              : `Could not load the outreach data: ${data.detail}`}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
              {FUNNEL.map((k) => {
                const on = stage === k;
                return (
                  <Link key={k} href={`/outreach?s=${k}`} className="p-3" style={{ ...box, borderColor: on ? "var(--bottomline-green)" : "var(--rule)" }}>
                    <p className="text-[22px] font-extrabold">{data.counts[k] ?? 0}</p>
                    <p className="text-[12px]" style={{ color: "var(--ink-secondary)" }}>{STAGE_LABEL[k]}</p>
                  </Link>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
              <Link href="/outreach" className="btn-small" style={stage === "active" ? { background: "var(--bottomline-green)", color: "var(--paper)" } : undefined}>All active</Link>
              {SIDE_EXITS.map((k) => (
                <Link key={k} href={`/outreach?s=${k}`} className="btn-small" style={stage === k ? { background: "var(--bottomline-green)", color: "var(--paper)" } : undefined}>
                  {STAGE_LABEL[k]} · {data.counts[k] ?? 0}
                </Link>
              ))}
            </div>

            <div className="mt-4 overflow-x-auto" style={box}>
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="eyebrow" style={{ borderBottom: "1px solid var(--rule)" }}>
                    <th className="p-3">Company</th><th className="p-3">Founder</th><th className="p-3">Status</th>
                    <th className="p-3">Last move</th><th className="p-3">Sector · HQ</th><th className="p-3">Raised</th><th className="p-3">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.items].sort((a, b) => +new Date(lastMove(b)) - +new Date(lastMove(a))).map((i) => (
                    <tr key={i.id} style={{ borderTop: "1px solid var(--rule)", background: i.stage === "replied" ? "rgba(0,0,0,0.03)" : undefined }}>
                      <td className="p-3 font-bold">
                        {i.linkedin_company_url ? <a href={i.linkedin_company_url} target="_blank" rel="noreferrer">{i.company_name}</a> : i.company_name}
                        {i.website && <a href={i.website} target="_blank" rel="noreferrer" aria-label="Website" className="ml-1.5 inline-block align-middle"><ExternalLink size={12} /></a>}
                      </td>
                      <td className="p-3">
                        {i.founder_name ? (
                          <>
                            {i.founder_url ? <a href={i.founder_url} target="_blank" rel="noreferrer">{i.founder_name}</a> : i.founder_name}
                            {i.founder_title && <span className="block text-[11.5px]" style={{ color: "var(--ink-secondary)" }}>{i.founder_title}</span>}
                          </>
                        ) : "—"}
                      </td>
                      <td className="p-3 font-bold" style={i.stage === "replied" ? { color: "var(--bottomline-green)" } : undefined}>
                        {STAGE_LABEL[i.stage] ?? i.stage}
                        {i.stage === "replied" && <span className="block text-[11.5px] font-normal" style={{ color: "var(--ink-secondary)" }}>Needs human follow-up</span>}
                      </td>
                      <td className="p-3">{fmtDate(lastMove(i))}</td>
                      <td className="p-3">{[i.sector, i.hq].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="p-3">{i.total_raised_text ?? "—"}</td>
                      <td className="p-3 text-[12px]" style={{ color: "var(--ink-secondary)" }}>{i.last_error ?? ""}</td>
                    </tr>
                  ))}
                  {data.items.length === 0 && <tr><td colSpan={7} className="p-6 text-center" style={{ color: "var(--ink-secondary)" }}>Nothing here yet.</td></tr>}
                </tbody>
              </table>
            </div>
            {data.items.length >= 200 && <p className="mt-2 text-[12px]" style={{ color: "var(--ink-secondary)" }}>Showing the first 200 of this view.</p>}
          </>
        )}
      </div>
    </>
  );
}
