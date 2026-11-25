"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { act, aiDraft } from "./actions";
import { REPLY_TAG, fmtDay, msgFor, daysSince, type Lead, type Settings } from "@/lib/outreach";
import { useToast } from "./Toast";

function Reply({ l, s }: { l: Lead; s: Settings }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, show] = useToast();
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const thread = ([["m1", l.dm_sent_at], ["f1", l.fu1_sent_at], ["f2", l.fu2_sent_at]] as ["m1" | "f1" | "f2", string | null][])
    .filter(([, at]) => at).map(([k]) => `— ${s.tpl[k].name} —\n${msgFor(l, k, s)}`).join("\n\n");
  const run = (fn: () => Promise<{ ok: boolean; error?: string } | { ok: true }>, done: string) => start(async () => {
    setErr(null);
    const r = (await fn()) as { ok: boolean; error?: string };
    if (!r.ok) return setErr(r.error ?? "Failed");
    show(done); router.refresh();
  });
  const close = (to: string) => run(() => act("close", l.id, { to }), "Done");

  return (
    <div className="card q">
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div>
            <Link href={`/outreach/pipeline?lead=${l.id}`} style={{ fontSize: 15, fontWeight: 700 }}>{l.company_name}</Link>{" "}
            <span className="muted">· {l.founder_name}{l.founder_title ? `, ${l.founder_title}` : ""}</span>
            <div className="muted" style={{ fontSize: 12.5 }}>{[l.round_name, l.round_amount, l.lead_investor].filter(Boolean).join(" · ")} · replied {fmtDay(l.replied_at)} ({daysSince(l.replied_at)}d ago)</div>
          </div>
          <span className={`tag ${REPLY_TAG[l.reply_label ?? ""] ?? ""}`}>AI read: {l.reply_label ?? "Unread"}</span>
        </div>
        <div className="reply">{l.reply_text ?? "The extension saw a reply but could not read its text. Open the conversation on LinkedIn."}</div>
        {thread && <details><summary className="muted" style={{ fontSize: 12.5, cursor: "pointer" }}>What we sent</summary><div className="thread">{thread}</div></details>}
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write Swetha's reply… (the extension sends it from her LinkedIn)" />
        <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
          <button className="btn pri sm" disabled={pending || !text.trim()} onClick={() => run(async () => { const r = await act("queue_reply", l.id, { text }); if (r.ok) setText(""); return r; }, "Queued. The extension sends it on its next round.")}>Send reply</button>
          <button className="btn sm" disabled={pending} onClick={() => start(async () => { setErr(null); const r = await aiDraft(l.id); if (!r.ok) return setErr(r.error); setText(r.data.text); })}>AI draft</button>
        </div>
        {err && <p className="err">{err}</p>}
      </div>
      <div className="actions">
        <button className="btn good" disabled={pending} onClick={() => close("interested")}>Interested – book call</button>
        <button className="btn" disabled={pending} onClick={() => close("nurture")}>Not now – nurture 90 days</button>
        <button className="btn" disabled={pending} onClick={() => { const n = window.prompt("Who did they refer you to? (name)"); if (n) run(() => act("refer", l.id, { text: n }), "New contact created in “Verified – to approve”."); }}>Referred to someone else</button>
        <button className="btn bad" disabled={pending} onClick={() => confirm("Close as not interested? They will never be contacted again.") && close("not_interested")}>Not interested – close</button>
      </div>
      {toast}
    </div>
  );
}

export default function Queue({ leads, settings, pending }: { leads: Lead[]; settings: Settings; pending: number }) {
  const replies = leads.filter((l) => l.stage === "replied").sort((a, b) => +new Date(a.replied_at ?? 0) - +new Date(b.replied_at ?? 0));
  const ints = leads.filter((l) => l.stage === "interested");
  const nur = leads.filter((l) => l.stage === "nurture");
  return (
    <div className="wrap">
      <div className="banner">Once a founder replies, the automation stops for that company and it lands here. Everything from this point is Swetha by hand. The AI only suggests how to read the reply and drafts a response; nothing is sent until you press Send reply.</div>
      {pending > 0 && <div className="banner warn">{pending} written {pending === 1 ? "reply is" : "replies are"} waiting for the extension to send. It sends them while it is running, inside the sending window.</div>}
      {replies.length ? replies.map((l) => <Reply key={l.id} l={l} s={settings} />) : <div className="card empty">No replies waiting.</div>}
      <div className="grid k2" style={{ marginTop: 6 }}>
        <div className="card"><h3>Interested – hand-off to advisory ({ints.length})</h3>
          {ints.length ? <table><thead><tr><th>Company</th><th>Founder</th><th>Since</th></tr></thead><tbody>{ints.map((l) => <tr key={l.id}><td><Link href={`/outreach/pipeline?lead=${l.id}`}>{l.company_name}</Link></td><td>{l.founder_name}</td><td>{fmtDay(l.stage_since)}</td></tr>)}</tbody></table> : <div className="muted">None yet</div>}
        </div>
        <div className="card"><h3>Nurture list ({nur.length})</h3>
          {nur.length ? <table><thead><tr><th>Company</th><th>Re-check</th></tr></thead><tbody>{nur.map((l) => <tr key={l.id}><td><Link href={`/outreach/pipeline?lead=${l.id}`}>{l.company_name}</Link></td><td>{fmtDay(new Date(Date.parse(l.stage_since) + 90 * 86400000).toISOString())}</td></tr>)}</tbody></table> : <div className="muted">None yet</div>}
        </div>
      </div>
    </div>
  );
}
