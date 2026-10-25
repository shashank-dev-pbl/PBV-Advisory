import Link from "next/link";
import { pageGate } from "@/lib/gate";
import { SIDE_EXITS, STAGE_LABEL, lastMove, loadOutreach } from "@/lib/outreach";
import PageHeader from "../(portal)/PageHeader";
import Locked from "../(portal)/Locked";
import Rows from "./Rows";

const box = { background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 10 } as const;
// "Active" is everything the bot has actually touched; Queued and Skipped are the long tail.
// One card per status in the brief; Scanning covers both "queued" and "founder found".
const CARDS = [
  { stages: ["new", "founder_found"], label: "Scanning" },
  { stages: ["connect_sent"], label: "Requested" },
  { stages: ["accepted"], label: "Accepted - Awaiting Message" },
  { stages: ["dm_sent"], label: "Message Sent" },
  { stages: ["replied"], label: "Replied - Handed to Team" },
];
const ACTIVE = ["founder_found", "connect_sent", "accepted", "dm_sent", "replied", "needs_review", "no_founder", "cannot_connect", "stale"];

export default async function OutreachPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { session, locked } = await pageGate("outreach");
  if (locked) return <Locked page="outreach" who={session.who!} />;

  const sp = await searchParams;
  const all = [...CARDS.flatMap((c) => c.stages), ...SIDE_EXITS] as string[];
  const picked = (sp.s ?? "").split(",").filter((x) => all.includes(x));
  const stage = picked.length ? picked.join(",") : "active";
  const data = await loadOutreach(picked.length ? picked : ACTIVE);

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
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              {CARDS.map((c) => {
                const key = c.stages.join(",");
                const on = stage === key;
                return (
                  <Link key={key} href={`/outreach?s=${key}`} className="p-3" style={{ ...box, borderColor: on ? "var(--bottomline-green)" : "var(--rule)" }}>
                    <p className="text-[22px] font-extrabold">{c.stages.reduce((n, k) => n + (data.counts[k] ?? 0), 0)}</p>
                    <p className="text-[12px]" style={{ color: "var(--ink-secondary)" }}>{c.label}</p>
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
                  <Rows items={[...data.items].sort((a, b) => +new Date(lastMove(b)) - +new Date(lastMove(a)))} />
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
