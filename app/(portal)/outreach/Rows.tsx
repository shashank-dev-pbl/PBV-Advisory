"use client";

import { Fragment, useState } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";
import { STAGE_LABEL, lastMove, type OutreachItem } from "@/lib/outreach";

// Always India time, whatever the viewer's computer is set to.
const IST = "Asia/Kolkata";
const dateIST = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: IST });
const timeIST = (d: string) => new Date(d).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: IST });

const muted = { color: "var(--ink-secondary)" } as const;

function Link({ href, children }: { href: string | null; children: React.ReactNode }) {
  return href ? <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>{children}</a> : <>{children}</>;
}

function Detail({ i }: { i: OutreachItem }) {
  // Oldest at the top, flowing down to the latest. Only steps the bot has reached.
  const steps = ([
    ["Scanning", i.created_at],
    ["Requested", i.connect_sent_at],
    ["Accepted - Awaiting Message", i.accepted_at],
    ["Message Sent", i.dm_sent_at],
    ["Replied - Handed to Team", i.replied_at],
  ] as [string, string | null][])
    .filter((s): s is [string, string] => !!s[1])
    .sort((x, y) => +new Date(x[1]) - +new Date(y[1]));
  const others = (i.founder_candidates ?? []).filter((c) => c.url !== i.founder_url);
  return (
    <div className="grid gap-8 p-5 text-[12.5px] md:grid-cols-2 md:gap-12">
      <div>
        <p className="eyebrow mb-2">History</p>
        <div>
          {steps.map(([label, at], n) => {
            const last = n === steps.length - 1;
            return (
              <div key={label} className="relative pl-6" style={{ paddingBottom: last ? 0 : 14 }}>
                {/* The line runs from this dot down to the next one, so it never sticks out above the first or below the last. */}
                {!last && <span className="absolute left-[4px] top-[14px] w-px" style={{ bottom: -4, background: "var(--rule)" }} />}
                {/* The current step pulses, to read as "this is where the lead is now". */}
                {last && <span className="absolute left-0 top-[9px] h-[9px] w-[9px] rounded-full motion-safe:animate-ping" style={{ background: "var(--bottomline-green)", opacity: 0.55 }} />}
                <span
                  className="absolute left-0 top-[9px] h-[9px] w-[9px] rounded-full"
                  style={{ background: last ? "var(--bottomline-green)" : "var(--ink-secondary)" }}
                />
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="inline-block rounded-full px-2.5 py-1 text-[12.5px] font-bold" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)" }}>{label}</span>
                    <p className="mt-0.5 pl-1 text-[12px]" style={muted}>LinkedIn Extension</p>
                  </div>
                  <span className="pt-1 text-right text-[12px]" style={muted}>
                    {dateIST(at)}
                    <span className="block">{timeIST(at)} IST</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-1.5" style={muted}>Last updated {dateIST(i.updated_at)}, {timeIST(i.updated_at)} IST</p>
      </div>
      <div>
        <p className="eyebrow mb-2">Company</p>
        <p className="text-[14px] font-extrabold">{i.company_name}</p>
        <p className="mt-1.5 text-[13px]">
          <span style={muted}>Founder: </span>
          {i.founder_name ? (
            <><b><Link href={i.founder_url}>{i.founder_name}</Link></b>{i.founder_title && <span style={muted}> · {i.founder_title}</span>}</>
          ) : <span style={muted}>not found yet</span>}
        </p>
        {others.length > 0 && (
          <div className="mt-1.5">
            <p style={muted}>Other people the bot considered</p>
            {others.map((c) => (
              <p key={c.url}><Link href={c.url}>{c.name}</Link>{c.title && <span style={muted}> · {c.title}</span>}</p>
            ))}
          </div>
        )}
        <div className="mt-3">
          <p>{i.linkedin_company_url ? <Link href={i.linkedin_company_url}>LinkedIn page</Link> : <span style={muted}>No LinkedIn page matched</span>}</p>
          {i.website && <p><Link href={i.website}>{i.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}</Link></p>}
          <p style={muted}>{[i.sector, i.hq].filter(Boolean).join(" · ") || "No sector or HQ"}</p>
          <p style={muted}>Raised: {i.total_raised_text ?? "not recorded"}</p>
        </div>
        {i.attempts > 0 && <p className="mt-3" style={muted}>Failed tries: {i.attempts} of 3</p>}
        {i.last_error && <p className="mt-1" style={{ color: "#8c1a1a" }}>Bot note: {i.last_error}</p>}
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
              <td className="p-3">{dateIST(lastMove(i))}</td>
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
