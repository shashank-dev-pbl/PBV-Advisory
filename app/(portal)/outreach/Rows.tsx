"use client";

import { Fragment, useState } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { STAGE_LABEL, lastMove, type OutreachItem } from "@/lib/outreach";

const muted = { color: "var(--ink-secondary)" } as const;

function Link({ href, children }: { href: string | null; children: React.ReactNode }) {
  return href ? <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>{children}</a> : <>{children}</>;
}

function Detail({ i }: { i: OutreachItem }) {
  // Newest first, only steps the bot has reached.
  const steps = ([
    ["Added to queue", i.created_at],
    ["1. Connection Sent", i.connect_sent_at],
    ["Connection Accepted", i.accepted_at],
    ["2. DM Sent", i.dm_sent_at],
    ["3. Reply Received", i.replied_at],
  ] as [string, string | null][])
    .filter((s): s is [string, string] => !!s[1])
    .sort((x, y) => +new Date(y[1]) - +new Date(x[1]));
  const others = (i.founder_candidates ?? []).filter((c) => c.url !== i.founder_url);
  return (
    <div className="grid gap-5 p-4 text-[12.5px] md:grid-cols-3">
      <div>
        <p className="eyebrow mb-2">History</p>
        <div className="relative">
          <span className="absolute bottom-2 left-[4px] top-2 w-px" style={{ background: "var(--rule)" }} />
          {steps.map(([label, at], n) => (
            <div key={label} className="relative mb-3 pl-6">
              <span
                className="absolute left-0 top-[9px] h-[9px] w-[9px] rounded-full"
                style={{ background: n === 0 ? "var(--bottomline-green)" : "var(--ink-secondary)", border: "2px solid var(--paper)" }}
              />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="inline-block rounded-full px-2.5 py-1 text-[12.5px] font-bold" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)" }}>{label}</span>
                  <p className="mt-0.5 pl-1 text-[12px]" style={muted}>LinkedIn Extension</p>
                </div>
                <span className="pt-1 text-[12px]" style={muted}>{fmtDate(at)}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-1.5" style={muted}>Last updated {fmtDateTime(i.updated_at)}</p>
      </div>
      <div>
        <p className="eyebrow mb-1.5">Company</p>
        <p><Link href={i.linkedin_company_url}>LinkedIn page</Link>{i.linkedin_company_url ? "" : <span style={muted}>No LinkedIn page matched</span>}</p>
        {i.website && <p><Link href={i.website}>{i.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}</Link></p>}
        <p style={muted}>{[i.sector, i.hq].filter(Boolean).join(" · ") || "No sector or HQ"}</p>
        <p style={muted}>Raised: {i.total_raised_text ?? "not recorded"}</p>
        <p className="mt-1.5" style={muted}>Bot attempts: {i.attempts}</p>
        {i.last_error && <p className="mt-1" style={{ color: "#8c1a1a" }}>Bot note: {i.last_error}</p>}
      </div>
      <div>
        <p className="eyebrow mb-1.5">Founder</p>
        {i.founder_name ? (
          <p><b><Link href={i.founder_url}>{i.founder_name}</Link></b>{i.founder_title && <span style={muted}> · {i.founder_title}</span>}</p>
        ) : <p style={muted}>Not found yet</p>}
        {others.length > 0 && (
          <>
            <p className="mt-2" style={muted}>Other people the bot considered</p>
            {others.map((c) => (
              <p key={c.url}><Link href={c.url}>{c.name}</Link>{c.title && <span style={muted}> · {c.title}</span>}</p>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export default function Rows({ items }: { items: OutreachItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (items.length === 0) return <tr><td colSpan={7} className="p-6 text-center" style={muted}>Nothing here yet.</td></tr>;
  return (
    <>
      {items.map((i) => {
        const on = open === i.id;
        return (
          <Fragment key={i.id}>
            <tr
              onClick={() => setOpen(on ? null : i.id)}
              className="cursor-pointer"
              style={{ borderTop: "1px solid var(--rule)", background: i.stage === "replied" ? "rgba(0,0,0,0.03)" : undefined }}
              aria-expanded={on}
            >
              <td className="p-3 font-bold">
                <ChevronRight size={13} className="mr-1 inline align-middle" style={{ transform: on ? "rotate(90deg)" : undefined, transition: "transform .15s" }} />
                {i.company_name}
                {i.website && <a href={i.website} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} aria-label="Website" className="ml-1.5 inline-block align-middle"><ExternalLink size={12} /></a>}
              </td>
              <td className="p-3">
                {i.founder_name ? (
                  <>{i.founder_name}{i.founder_title && <span className="block text-[11.5px]" style={muted}>{i.founder_title}</span>}</>
                ) : "—"}
              </td>
              <td className="p-3 font-bold" style={i.stage === "replied" ? { color: "var(--bottomline-green)" } : undefined}>
                {STAGE_LABEL[i.stage] ?? i.stage}
                {i.stage === "replied" && <span className="block text-[11.5px] font-normal" style={muted}>Needs human follow-up</span>}
              </td>
              <td className="p-3">{fmtDate(lastMove(i))}</td>
              <td className="p-3">{[i.sector, i.hq].filter(Boolean).join(" · ") || "—"}</td>
              <td className="p-3">{i.total_raised_text ?? "—"}</td>
              <td className="p-3 text-[12px]" style={muted}>{i.last_error ?? ""}</td>
            </tr>
            {on && <tr style={{ background: "var(--paper)" }}><td colSpan={7}><Detail i={i} /></td></tr>}
          </Fragment>
        );
      })}
    </>
  );
}
