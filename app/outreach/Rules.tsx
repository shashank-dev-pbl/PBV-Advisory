"use client";

import { useState, useTransition } from "react";
import { saveSettings } from "./actions";
import type { Cfg, Settings } from "@/lib/outreach";
import { useToast } from "./Toast";

export default function Rules({ settings }: { settings: Settings }) {
  const [pending, start] = useTransition();
  const [toast, show] = useToast();
  const [c, setC] = useState<Cfg>(settings.cfg);
  const [err, setErr] = useState<string | null>(null);
  const dirty = JSON.stringify(c) !== JSON.stringify(settings.cfg);
  const num = (k: keyof Cfg, l: string, h?: string) => (
    <div className="field"><label>{l}</label><input type="number" min={0} value={c[k] as number} onChange={(e) => setC({ ...c, [k]: e.target.value === "" ? 0 : +e.target.value })} />{h && <div className="help">{h}</div>}</div>
  );
  const txt = (k: keyof Cfg, l: string, h?: string) => (
    <div className="field"><label>{l}</label><input value={c[k] as string} onChange={(e) => setC({ ...c, [k]: e.target.value })} />{h && <div className="help">{h}</div>}</div>
  );
  const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

  return (
    <div className="wrap">
      <div className="card" style={{ marginBottom: 14 }}><h3>The sequence</h3>
        <div className="flow"><span>Found in Source 1</span><em>→</em><span>ICP check</span><em>→</em><span>Warming {c.warmingHours}h · need {c.minSources} sources</span><em>→</em><span>{c.requireApproval ? "Swetha approves" : "Auto-approve"}</span><em>→</em><span>Connection request + note</span><em>→ accepted →</em><span>+{c.m1DelayDays}d Message 1</span><em>→</em><span>+{c.f1Days}d Follow-up 1</span><em>→</em><span>+{c.f2Days}d Follow-up 2</span><em>→</em><span>+{c.closeDays}d close</span></div>
        <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Any reply at any point stops the sequence and moves the company to Swetha&apos;s queue. Already-connected founders skip the invite and go straight to Message 1.</p></div>

      <div className="card" style={{ marginBottom: 14 }}><h3>Verification</h3><div className="form">
        {num("minSources", "Sources needed to verify", "Source 1 + at least one other")}
        {num("warmingHours", "Warming period (hours)", "Minimum wait after discovery, even if verified early")}
        {num("maxVerifyDays", "Give up after (days)", "Close as unverified if not enough sources by then")}
        <div className="field"><label>Approval</label><label className="tg"><input type="checkbox" style={{ width: "auto" }} checked={c.requireApproval} onChange={(e) => setC({ ...c, requireApproval: e.target.checked })} /> Swetha approves each company before anything is sent</label><div className="help">Recommended for the first month, until the messages and data are trusted.</div></div>
      </div></div>

      <div className="card" style={{ marginBottom: 14 }}><h3>Timing</h3><div className="form">
        {num("acceptWaitDays", "Wait for invite acceptance (days)", "Closed as not accepted after this")}
        {num("m1DelayDays", "Message 1 after acceptance (days)")}
        {num("f1Days", "Follow-up 1 after Message 1 (days)")}
        {num("f2Days", "Follow-up 2 after Follow-up 1 (days)")}
        {num("closeDays", "Close after Follow-up 2 (days)")}
        <div className="field"><label>Sending window (India time)</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="number" min={0} max={23} value={c.sendFrom} onChange={(e) => setC({ ...c, sendFrom: +e.target.value })} /><span>to</span><input type="number" min={1} max={24} value={c.sendTo} onChange={(e) => setC({ ...c, sendTo: +e.target.value })} /></div>
          <div className="help">Nothing goes out outside {hh(c.sendFrom)}–{hh(c.sendTo)} IST, or on Sundays</div></div>
      </div></div>

      <div className="card" style={{ marginBottom: 14 }}><h3>Account safety</h3><div className="form">
        {num("connCap", "Connection requests per day", "LinkedIn caps invites at roughly 100 a week. Stay well under (25 is the most this accepts).")}
        {num("msgCap", "Messages per day", "Message 1, follow-ups and replies all count")}
        {num("gapMinSec", "Shortest gap between actions (seconds)")}
        {num("gapMaxSec", "Longest gap between actions (seconds)")}
        <div className="field"><label>Other rules</label><div className="help" style={{ fontSize: 12.5, color: "var(--o-ink)" }}>Never contact the same company twice · Skip anyone already in a conversation · The extension pauses itself if LinkedIn shows a warning or captcha</div></div>
      </div></div>

      <div className="card"><h3>Who we target (ICP)</h3><div className="form">
        {txt("stages", "Funding stages")}
        {txt("geo", "Geography", "Applied when the source gives a country")}
        {num("minAmountCr", "Minimum round size (₹ Cr)")}
        {num("maxAmountCr", "Maximum round size (₹ Cr)")}
        {num("usdInr", "₹ per US$", "Used to compare dollar rounds with the range above")}
        {txt("excludeSectors", "Exclude sectors")}
        {num("lookbackDays", "Only rounds announced in the last (days)")}
        {txt("roles", "Who to contact, in order", "First match found on LinkedIn is used")}
      </div></div>

      {err && <p className="err">{err}</p>}
      <div style={{ position: "sticky", bottom: 0, background: "var(--o-bg)", padding: "12px 0", display: "flex", gap: 10, alignItems: "center" }}>
        <button className="btn pri" disabled={pending || !dirty} onClick={() => start(async () => {
          setErr(null);
          const r = await saveSettings({ cfg: c });
          if (!r.ok) return setErr(r.error);
          show("Saved. The extension uses these on its next round.");
        })}>{pending ? "Saving…" : "Save rules"}</button>
        {dirty && <span className="muted" style={{ fontSize: 12.5 }}>Unsaved changes</span>}
      </div>
      {toast}
    </div>
  );
}
