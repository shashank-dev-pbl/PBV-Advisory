"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Drawer from "./Drawer";
import { act } from "./actions";
import { CLOSED, REPLY_TAG, missingAll, SOURCES, STAGES, daysSince, fmtDay, type Hit, type Lead, type LeadEvent, type Settings } from "@/lib/outreach";
import { useToast } from "./Toast";

function Card({ l, hits, s, onOpen }: { l: Lead; hits: Hit[]; s: Settings; onOpen: () => void }) {
  const have = new Set(hits.filter((h) => h.queue_id === l.id).map((h) => h.source));
  const n = SOURCES.filter((x) => have.has(x.id)).length;
  const age = daysSince(l.stage_since);
  let flag: React.ReactNode = null;
  if (l.stage === "ready") flag = l.approved || !s.cfg.requireApproval ? <span className="tag good">Approved</span> : <span className="tag warn">Needs approval</span>;
  if (l.stage === "verifying") flag = n >= s.cfg.minSources ? <span className="tag good">Enough sources</span> : <span className="tag">{s.cfg.minSources - n} more needed</span>;
  if (l.stage === "replied") flag = <span className={`tag ${REPLY_TAG[l.reply_label ?? ""] ?? ""}`}>{l.reply_label ?? "Unread"}</span>;
  if (l.paused) flag = <span className="tag bad">Paused</span>;
  const lookup = l.flag ? <span className="tag warn">Needs founder</span> : null;
  const gaps = l.stage === "ready" && !l.approved ? missingAll(l, s) : [];
  return (
    <div className="lc" onClick={onOpen}>
      <b>{l.company_name}</b>
      <div className="m">{[l.round_name, l.round_amount || l.total_raised_text, l.hq].filter(Boolean).join(" · ") || "No round details"}</div>
      <div className="m">{l.founder_name || (l.flag ? "Founder not found" : "Founder not looked up yet")}</div>
      <div className="dots">{SOURCES.map((x) => <i key={x.id} className={have.has(x.id) ? "on" : ""} title={x.name} />)}<span>{n}/{SOURCES.length} sources</span></div>
      <div className="f"><span>{age === 0 ? "today" : `${age}d in stage`}</span><span>{lookup}{" "}{gaps.length > 0 && <span className="tag bad" title={`Messages need: ${gaps.join(", ")}`}>Details missing</span>}{" "}{flag}{l.already_first && ["ready", "verifying", "discovered"].includes(l.stage) && <span className="tag acc">1st degree</span>}</span></div>
    </div>
  );
}

// The board: one column per stage. Gold is verification, blue is automated outreach, green is Swetha.
export default function Pipeline({ leads, hits, events, settings, openId }: { leads: Lead[]; hits: Hit[]; events: LeadEvent[]; settings: Settings; openId: number | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, show] = useToast();
  const [q, setQ] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [open, setOpen] = useState<number | null>(openId);
  const needle = q.toLowerCase();
  const match = (l: Lead) => !needle || [l.company_name, l.sector, l.hq, l.founder_name, l.lead_investor].join(" ").toLowerCase().includes(needle);
  const toApprove = leads.filter((l) => l.stage === "ready" && !l.approved);
  const complete = toApprove.filter((l) => missingAll(l, settings).length === 0);
  const approvedWaiting = leads.filter((l) => l.stage === "ready" && l.approved).length;
  const closed = useMemo(() => leads.filter((l) => CLOSED[l.stage] && match(l)), [leads, needle]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = leads.filter((l) => CLOSED[l.stage]).length;

  return (
    <div className="wrap">
      <div className="ptools">
        <input type="search" placeholder="Search company, founder, investor…" value={q} onChange={(e) => setQ(e.target.value)} />
        {complete.length > 0 && (
          <button className="btn pri" disabled={pending} onClick={() => confirm(`Approve ${complete.length} verified companies? They go out in the next sending window.${toApprove.length > complete.length ? ` ${toApprove.length - complete.length} more are skipped because their messages still have empty fields.` : ""}`) && start(async () => {
            let done = 0;
            for (const l of complete) { const r = await act("approve", l.id); if (!r.ok) return show(r.error); done++; }
            show(`Approved ${done}.${toApprove.length > done ? ` ${toApprove.length - done} skipped: messages need more details.` : ""} They go out in the next sending window.`);
            router.refresh();
          })}>Approve all complete ({complete.length})</button>
        )}
        <label className="tg"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show closed ({total})</label>
        <span className="muted" style={{ fontSize: 12.5, marginLeft: "auto" }}>Gold = verification · Blue = automated outreach · Green = Swetha</span>
      </div>

      {leads.length === 0 && <div className="banner">Nothing here yet. Companies appear when Source 1 is connected and the daily scan runs, or when you add one by hand on the Sources page.</div>}

      <div className="board">
        {STAGES.map((s) => {
          const ls = leads.filter((l) => l.stage === s.id && match(l));
          return (
            <div key={s.id} className={`col ${s.group}`}>
              <h4>{s.label}<span className="n">{s.id === "ready" && settings.cfg.requireApproval ? ls.filter((l) => !l.approved).length : ls.length}</span></h4>
              {s.hint && <div className="hint">{s.hint}{s.id === "ready" && approvedWaiting > 0 ? ` ${approvedWaiting} approved, waiting to send.` : ""}</div>}
              {ls.map((l) => <Card key={l.id} l={l} hits={hits} s={settings} onOpen={() => setOpen(l.id)} />)}
            </div>
          );
        })}
      </div>

      {showClosed && (
        <div className="card closed-table"><h3>Closed</h3>
          {closed.length ? (
            <table><thead><tr><th>Company</th><th>Round</th><th>Reason</th><th>Closed on</th></tr></thead>
              <tbody>{closed.map((l) => (
                <tr key={l.id} className="click" onClick={() => setOpen(l.id)}>
                  <td>{l.company_name}</td><td>{[l.round_name, l.round_amount].filter(Boolean).join(" · ") || "–"}</td><td>{CLOSED[l.stage]}</td><td>{fmtDay(l.stage_since)}</td>
                </tr>))}</tbody></table>
          ) : <div className="empty">Nothing closed</div>}
        </div>
      )}
      <Drawer key={open ?? 0} lead={leads.find((l) => l.id === open) ?? null} hits={hits} events={events} settings={settings} onClose={() => setOpen(null)} />
      {toast}
    </div>
  );
}
