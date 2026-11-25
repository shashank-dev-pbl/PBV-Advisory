"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { act, aiHook, giveFounder } from "./actions";
import {
  CLOSED, MESSAGE_KEYS, REPLY_TAG, SOURCES, STAGE_LABEL, fmtDay, fmtTime, isActive, missingFor, msgFor, needsFounder, renderTpl, sourceName,
  type Hit, type Lead, type LeadEvent, type Settings,
} from "@/lib/outreach";
import { useToast } from "./Toast";

const ext = (u: string | null) => (u ? (u.startsWith("http") ? u : `https://${u}`) : null);

// One company, opened from the Pipeline, the reply queue or the dashboard feed: the round, who confirmed it, who we contact,
// the four messages as this company will receive them, the reply, and the history. Actions sit at the bottom.
export default function Drawer({ lead, hits, events, settings, onClose }: { lead: Lead | null; hits: Hit[]; events: LeadEvent[]; settings: Settings; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, show] = useToast();
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ founderUrl: "", founderName: "", founderTitle: "", companyUrl: "" });
  const [src5, setSrc5] = useState("");
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const run = (action: string, args: Record<string, unknown> = {}, ok?: string) => {
    if (!lead) return;
    setErr(null);
    start(async () => {
      const r = await act(action, lead.id, args);
      if (!r.ok) return setErr(r.error);
      if (ok) show(ok);
      router.refresh();
    });
  };

  const c = settings.cfg;
  const open = !!lead;
  let body: React.ReactNode = null;
  let foot: React.ReactNode = null;
  let head: React.ReactNode = null;

  if (lead) {
    const mine = hits.filter((h) => h.queue_id === lead.id);
    const have = new Set(mine.map((h) => h.source));
    const n = SOURCES.filter((s) => have.has(s.id)).length;
    const closed = !!CLOSED[lead.stage];
    const inSequence = ["conn_sent", "connected", "msg1", "fu1", "fu2"].includes(lead.stage);
    // What the company's History shows: the sentences we logged, oldest first. Older leads (before the log existed) get one from their dates.
    const mineEvents = events.filter((e) => e.queue_id === lead.id).map((e) => ({ at: e.at, t: e.detail! }));
    const log = mineEvents.length
      ? mineEvents
      : ([[lead.created_at, "Added to the list"], [lead.connect_sent_at, "Connection request sent"], [lead.accepted_at, "Connection accepted"], [lead.dm_sent_at, "Message 1 sent"], [lead.fu1_sent_at, "Follow-up 1 sent"], [lead.fu2_sent_at, "Follow-up 2 sent"], [lead.replied_at, "Reply received"]] as [string | null, string][])
          .filter((x): x is [string, string] => !!x[0]).map(([at, t]) => ({ at, t }));
    const stateTag = closed ? <span className="tag bad">{CLOSED[lead.stage]}</span> : <span className="tag acc">{STAGE_LABEL[lead.stage]}</span>;

    head = (
      <div className="dh">
        <div style={{ flex: 1 }}>
          <h2>{lead.company_name}</h2>
          <div className="muted">{[lead.sector, lead.hq].filter(Boolean).join(" · ") || "No sector or city yet"}</div>
          <div style={{ marginTop: 6 }}>{stateTag} {lead.paused && <span className="tag bad">Paused</span>} {lead.already_first && <span className="tag acc">1st degree</span>}</div>
        </div>
        <button className="btn sm" onClick={onClose}>Close ✕</button>
      </div>
    );

    const notMissing = MESSAGE_KEYS.flatMap((k) => missingFor(lead, k, settings).map((m) => `${settings.tpl[k].name}: ${m}`));
    body = (
      <div className="db">
        {lead.last_error && !closed && <div className="banner warn" style={{ marginBottom: 14 }}>{lead.last_error}{lead.attempts >= 3 && " The extension gave up after 3 tries and skips this company until it is fixed."}</div>}
        {lead.stage === "ready" && !lead.approved && notMissing.length > 0 && (
          <div className="banner warn" style={{ marginBottom: 14 }}>
            Before this goes out, fill in what the messages need: {notMissing.join("; ")}. Edit the message below, or add the missing details.
          </div>
        )}

        <div className="sec"><h5>Funding round</h5><div className="kv">
          <div>Round</div><div>{lead.round_name || "–"}</div>
          <div>Amount</div><div>{lead.round_amount || lead.total_raised_text || "–"}</div>
          <div>Lead investor</div><div>{lead.lead_investor || "–"}</div>
          <div>All investors</div><div>{lead.investors || "–"}</div>
          <div>What they do</div><div>{lead.description || "–"}</div>
          <div>Website</div><div>{lead.website ? <a href={ext(lead.website)!} target="_blank" rel="noreferrer">{lead.website}</a> : "–"}</div>
          <div>Company page</div><div>{lead.linkedin_company_url ? <a href={ext(lead.linkedin_company_url)!} target="_blank" rel="noreferrer">LinkedIn</a> : "–"}</div>
        </div></div>

        <div className="sec"><h5>Verification – {n} of {SOURCES.length} sources (need {c.minSources})</h5>
          {SOURCES.map((s) => {
            const h = mine.find((x) => x.source === s.id);
            return (
              <div className="src" key={s.id}>
                <span className={`ic ${h ? "ok" : ""}`}>{h ? "✓" : "·"}</span>
                <span style={{ flex: 1 }}>{h?.url ? <a href={h.url} target="_blank" rel="noreferrer">{s.name}</a> : s.name} <span className="muted" style={{ fontSize: 12 }}>– {s.role}</span></span>
                <span className="muted">{h ? fmtDay(h.found_on) : lead.stage === "verifying" ? "checking…" : "not found"}</span>
              </div>
            );
          })}
          {mine.some((h) => h.source === "manual" || h.source === "import") && <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>{sourceName(mine.find((h) => h.source === "manual" || h.source === "import")!.source)}: skipped verification.</p>}
          <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>Match rule: same company (name), the round announced within 21 days, amount within ±15%. An article with a different amount is flagged here for a look instead of counting.</p>
          {["discovered", "verifying", "ready"].includes(lead.stage) && !have.has("s5") && (
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <input className="mono" style={{ flex: 1, border: "1px solid var(--o-line)", borderRadius: 7, padding: "5px 8px" }} placeholder="Link to the company or investor post (optional)" value={src5} onChange={(e) => setSrc5(e.target.value)} />
              <button className="btn sm" disabled={pending} onClick={() => run("confirm_source", { source: "s5", url: src5 }, "Marked as confirmed")}>Confirmed by company post</button>
            </div>
          )}
        </div>

        <div className="sec"><h5>Who we contact</h5>
          <div className="kv">
            <div>Name</div><div>{lead.founder_name || "–"}</div>
            <div>Title</div><div>{lead.founder_title || "–"}</div>
            <div>LinkedIn</div><div>{lead.founder_url ? <a href={ext(lead.founder_url)!} target="_blank" rel="noreferrer">{lead.founder_url.replace(/^https?:\/\/(www\.)?/, "")}</a> : <span className="tag warn">{lead.flag === "no_founder" ? "No founder found – needs manual lookup" : lead.flag === "needs_review" ? "Company unclear – needs manual lookup" : "Not found yet – the extension looks it up"}</span>}</div>
            <div>Connection</div><div>{lead.already_first ? "Already 1st degree – invite step skipped" : lead.connect_sent_at ? "Invite sent" : "Not connected – invite first"}</div>
          </div>
          {(lead.founder_candidates ?? []).filter((x) => x.url !== lead.founder_url).length > 0 && (
            <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>Others considered: {(lead.founder_candidates ?? []).filter((x) => x.url !== lead.founder_url).map((x) => `${x.name}${x.title ? ` (${x.title})` : ""}`).join(", ")}</p>
          )}
          {!needsFounder(lead) && !changing && ["discovered", "verifying", "ready"].includes(lead.stage) && (
            <p style={{ fontSize: 12, margin: "8px 0 0" }}><a href="#" onClick={(e) => { e.preventDefault(); setChanging(true); }}>Change founder</a> <span className="muted">(wrong person or link)</span></p>
          )}
          {(needsFounder(lead) || changing) && ["discovered", "verifying", "ready"].includes(lead.stage) && (
            <div style={{ marginTop: 10, padding: 10, background: "#f8f3e6", border: "1px solid var(--o-line)", borderRadius: 8 }}>
              <b style={{ fontSize: 12.5 }}>{changing ? "Change the founder" : "Give the founder by hand"}</b>
              <div className="field" style={{ display: "grid", gap: 6, marginTop: 6 }}>
                <input placeholder="Founder's LinkedIn profile link (linkedin.com/in/…)" value={f.founderUrl} onChange={(e) => setF({ ...f, founderUrl: e.target.value })} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <input placeholder="Founder's name" value={f.founderName} onChange={(e) => setF({ ...f, founderName: e.target.value })} />
                  <input placeholder="Title (optional)" value={f.founderTitle} onChange={(e) => setF({ ...f, founderTitle: e.target.value })} />
                </div>
                {!lead.linkedin_company_url && <input placeholder="Company's LinkedIn page (optional)" value={f.companyUrl} onChange={(e) => setF({ ...f, companyUrl: e.target.value })} />}
              </div>
              <button className="btn pri sm" style={{ marginTop: 8 }} disabled={pending} onClick={() => start(async () => {
                setErr(null);
                const r = await giveFounder({ id: lead.id, ...f });
                if (!r.ok) return setErr(r.error);
                show("Founder saved"); setChanging(false); router.refresh();
              })}>Save founder</button>
              {changing && <button className="btn sm" style={{ marginTop: 8, marginLeft: 6 }} onClick={() => setChanging(false)}>Cancel</button>}
              {err && <p className="err" style={{ margin: "8px 0 0" }}>{err}</p>}
            </div>
          )}
        </div>

        <div className="sec"><h5>AI line about the company</h5>
          <div className="msg"><textarea style={{ minHeight: 54 }} defaultValue={lead.hook ?? ""} key={`h${lead.id}-${lead.hook}`} onBlur={(e) => e.target.value.trim() !== (lead.hook ?? "") && run("set_hook", { text: e.target.value.trim() }, "Saved")} placeholder="Nothing specific found in the articles. Messages work without it." /></div>
          <p className="muted" style={{ fontSize: 12, margin: "-4px 0 0" }}>Written from the articles that confirmed the round. Edit it here; it flows into the messages below.{" "}
            {["discovered", "verifying", "ready"].includes(lead.stage) && <a href="#" onClick={(e) => { e.preventDefault(); start(async () => { const r = await aiHook(lead.id); if (!r.ok) return setErr(r.error); show("Line written"); router.refresh(); }); }}>Write it with AI</a>}
          </p>
        </div>

        <div className="sec"><h5>Messages for this company</h5>
          {MESSAGE_KEYS.map((k) => {
            const text = msgFor(lead, k, settings);
            const lim = settings.tpl[k].limit;
            const edited = lead.overrides?.[k] !== undefined;
            return (
              <div className="msg" key={k}>
                <div className="mh"><b>{settings.tpl[k].name}</b>
                  <span>{lim ? <span className={text.length > lim ? "over" : ""}>{text.length}/{lim} chars</span> : renderTpl(settings.tpl[k].when, lead, c)}
                    {edited && <> · <a href="#" onClick={(e) => { e.preventDefault(); run("clear_override", { key: k }); }}>reset to template</a></>}
                  </span>
                </div>
                <textarea key={`${lead.id}${k}${text}`} defaultValue={text} readOnly={closed || ["replied", "interested"].includes(lead.stage)}
                  onBlur={(e) => e.target.value !== text && run("set_override", { key: k, text: e.target.value }, "Message saved for this company")} />
              </div>
            );
          })}
        </div>

        {lead.reply_text && (
          <div className="sec"><h5>Reply</h5><div className="reply">{lead.reply_text}</div>
            <span className={`tag ${REPLY_TAG[lead.reply_label ?? ""] ?? ""}`}>AI read: {lead.reply_label ?? "Unread"}</span></div>
        )}

        <div className="sec"><h5>History</h5>
          <div className="log">
            {log.map((e, i) => (
              <div key={i} className={i === log.length - 1 && isActive(lead) ? "now" : ""}><small>{fmtDay(e.at)}, {fmtTime(e.at)} IST</small> {e.t}</div>
            ))}
          </div>
        </div>
        {err && !((needsFounder(lead) || changing) && ["discovered", "verifying", "ready"].includes(lead.stage)) && <p className="err">{err}</p>}
      </div>
    );

    foot = (
      <div className="df" style={{ flexDirection: "column", alignItems: "stretch" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {lead.stage === "ready" && !lead.approved && <button className="btn pri" disabled={pending} onClick={() => run("approve", {}, "Approved. Goes out in the next sending window.")}>Approve & queue</button>}
          {lead.stage === "ready" && lead.approved && <span className="tag good" style={{ alignSelf: "center" }}>Approved</span>}
          {(isActive(lead) && !["replied", "interested"].includes(lead.stage)) && <button className="btn" disabled={pending} onClick={() => run(lead.paused ? "resume" : "pause")}>{lead.paused ? "Resume" : "Pause"} automation</button>}
          {inSequence && <button className="btn" disabled={pending} onClick={() => { const t = window.prompt("Paste the reply they sent:"); if (t) run("mark_replied", { text: t }); }}>Mark as replied (manual)</button>}
          {["discovered", "verifying", "ready"].includes(lead.stage) && <button className="btn bad" disabled={pending} onClick={() => confirm(`Exclude ${lead.company_name}? It will not be contacted.`) && run("exclude")}>Exclude</button>}
          {lead.stage === "replied" && <a className="btn" href={`/outreach/queue`}>Open in Swetha&apos;s queue</a>}
        </div>
        {toast}
      </div>
    );
  }

  return (
    <>
      <div className={`scrim${open ? " open" : ""}`} onClick={onClose} />
      <div className={`drawer${open ? " open" : ""}`} role="dialog" aria-label="Company">
        {head}{body}{foot}
      </div>
    </>
  );
}
