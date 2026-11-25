"use client";

import { useState, useTransition } from "react";
import { saveSettings } from "./actions";
import { DEFAULT_TPL, MESSAGE_KEYS, REPLY_PROMPT, renderTpl, type Lead, type Settings, type Templates } from "@/lib/outreach";
import { useToast } from "./Toast";

const SAMPLE: Lead = {
  id: 0, company_name: "Krishigrid", website: null, hq: "Pune", sector: "Agritech", total_raised_text: null, stage: "ready", linkedin_company_url: null,
  founder_name: "Ritika Deshmukh", founder_title: "Co-founder & CEO", founder_url: null, founder_candidates: null, connect_sent_at: null, accepted_at: null, dm_sent_at: null,
  fu1_sent_at: null, fu2_sent_at: null, replied_at: null, verified_at: null, attempts: 0, last_error: null, created_at: "", updated_at: "", stage_since: "",
  round_name: "Series A", round_amount: "₹62 Cr", lead_investor: "Kaveri Ventures", investors: "Kaveri Ventures, Banyan Seed Fund", description: null, announced_on: null,
  hook: "Read that the round goes into taking the cold-storage network from 4 to 12 districts.", approved: false, paused: false, already_first: false, flag: null,
  reply_text: null, reply_label: null, overrides: {}, referred_from: null,
};
const VARS = ["first_name", "full_name", "company", "round", "amount", "lead_investor", "investors", "sector", "city", "hook"];

export default function Messages({ settings, leads }: { settings: Settings; leads: Lead[] }) {
  const [pending, start] = useTransition();
  const [toast, show] = useToast();
  const [tpl, setTpl] = useState<Templates>(settings.tpl);
  const [prompt, setPrompt] = useState(settings.prompt);
  const [err, setErr] = useState<string | null>(null);
  const opts = leads.filter((l) => l.founder_name);
  const [pid, setPid] = useState<number>(opts[0]?.id ?? 0);
  const L = opts.find((l) => l.id === pid) ?? SAMPLE;
  const dirty = JSON.stringify(tpl) !== JSON.stringify(settings.tpl) || prompt !== settings.prompt;
  const cnt = (s: string, lim?: number) => (lim ? <> · <span className={s.length > lim ? "over" : ""}>{s.length}/{lim} chars</span></> : null);

  return (
    <div className="wrap">
      <div className="banner">These four messages go out in Swetha&apos;s name, so change anything that doesn&apos;t sound like her. The extension reads them from here before every send. A company can also have its own edit (open it on the Pipeline).</div>
      <div className="card" style={{ marginBottom: 14, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div className="field" style={{ minWidth: 260 }}><label>Preview with company</label>
          <select value={pid} onChange={(e) => setPid(+e.target.value)}>
            {opts.length === 0 && <option value={0}>Sample: Krishigrid – Series A</option>}
            {opts.map((o) => <option key={o.id} value={o.id}>{o.company_name} – {o.round_name ?? "no round"}</option>)}
          </select></div>
        <div className="vars" style={{ flex: 1 }}><div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Fields you can use</div>{VARS.map((v) => <span key={v}>{`{{${v}}}`}</span>)}</div>
        <button className="btn" onClick={() => confirm("Reset all four messages to the original text?") && setTpl(DEFAULT_TPL)}>Reset templates</button>
      </div>

      {MESSAGE_KEYS.map((k) => {
        const t = tpl[k];
        const out = renderTpl(t.body, L, settings.cfg);
        return (
          <div className="card" style={{ marginBottom: 14 }} key={k}>
            <h3>{t.name} <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>– {renderTpl(t.when, L, settings.cfg)}</span></h3>
            <div className="tpl">
              <div><div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Template</div>
                <textarea value={t.body} onChange={(e) => setTpl({ ...tpl, [k]: { ...t, body: e.target.value } })} /></div>
              <div><div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>How {L.founder_name} sees it{cnt(out, t.limit)}</div><div className="preview">{out}</div></div>
            </div>
          </div>
        );
      })}

      <div className="card"><h3>AI instruction for the company line ({"{{hook}}"})</h3>
        <p className="muted" style={{ fontSize: 12.5, marginTop: -4 }}>Runs once per company after verification, using the text of the articles that confirmed the round. Swetha can edit the line on each company before approving.</p>
        <textarea className="mono" style={{ width: "100%", minHeight: 200, border: "1px solid var(--o-line)", borderRadius: 7, padding: 10, background: "#fff" }} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        <h3 style={{ marginTop: 16 }}>AI instruction for reading replies</h3>
        <div className="preview mono" style={{ minHeight: 0 }}>{REPLY_PROMPT}</div>
      </div>

      {err && <p className="err">{err}</p>}
      <div style={{ position: "sticky", bottom: 0, background: "var(--o-bg)", padding: "12px 0", display: "flex", gap: 10, alignItems: "center" }}>
        <button className="btn pri" disabled={pending || !dirty} onClick={() => start(async () => {
          setErr(null);
          const r = await saveSettings({ tpl, prompt });
          if (!r.ok) return setErr(r.error);
          show("Saved. The extension uses these on its next round.");
        })}>{pending ? "Saving…" : "Save messages"}</button>
        {dirty && <span className="muted" style={{ fontSize: 12.5 }}>Unsaved changes</span>}
      </div>
      {toast}
    </div>
  );
}
