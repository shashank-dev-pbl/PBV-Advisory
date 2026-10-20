"use client";

import { useState } from "react";
import { getSignedDownloadUrl } from "@/app/founder/actions";
import { unwrap } from "@/lib/actionResult";
import { fmtDateTime } from "@/lib/dates";
import { Expander, Own } from "./ui";
import { saveSummary } from "./actions";
import type { Owner } from "@/lib/master/types";

// The side panel every document and filing opens: what it is, why it matters, the figures typed when it was uploaded, the file
// itself, how it works, and every version. Text comes from the explainers (07), not from code.

export type ExplainerFull = {
  doc_type: string; name: string; what_it_is: string | null; why_it_matters: string | null;
  summary_fields: { label: string; type: string }[] | null; where_from: string | null; what_pba_checks: string | null; if_late: string | null;
};
export type Version = { id: string; version: number; filename: string; storage_path: string; by_name: string | null; at: string; reason: string | null; removed: boolean };
export type SummaryValue = { field: string; value: string | null; entered_by_name: string | null; entered_at: string };
export type DrawerTarget = {
  key: string; period?: string | null; name: string; ctx: string; explainer: ExplainerFull | null; owner: Owner; ownerLabel: string; dueText?: string;
  versions: Version[]; values: SummaryValue[]; justUploaded?: boolean;
};

const isPdf = (f: string) => /\.pdf$/i.test(f);
const isImg = (f: string) => /\.(png|jpe?g|gif|webp)$/i.test(f);

export default function Drawer({ t, onClose, onUpload, onRemove, onSaved }: {
  t: DrawerTarget; onClose: () => void; onUpload: (replace: boolean) => void; onRemove: () => void; onSaved: (v: SummaryValue[]) => void;
}) {
  const ex = t.explainer;
  const current = t.versions.filter((v) => !v.removed).sort((a, b) => b.version - a.version)[0];
  const fields = (ex?.summary_fields ?? []) as { label: string; type: string }[];
  const auto = ex?.doc_type === "mis";
  const [editing, setEditing] = useState(!!t.justUploaded || (t.values.length === 0 && !!current));
  const [draft, setDraft] = useState<Record<string, string>>(Object.fromEntries(t.values.map((v) => [v.field, v.value ?? ""])));
  const [err, setErr] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function openFile(download: boolean) {
    if (!current) return;
    const u = await getSignedDownloadUrl(current.storage_path);
    if (download) window.open(u, "_blank"); else setUrl(u);
  }
  async function save() {
    setBusy(true); setErr("");
    try {
      unwrap(await saveSummary({ reqKey: t.key, period: t.period ?? null, values: draft }));
      onSaved(fields.map((f) => ({ field: f.label, value: draft[f.label] ?? "", entered_by_name: "You", entered_at: new Date().toISOString() })).filter((v) => v.value));
      setEditing(false);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not save"); }
    setBusy(false);
  }
  const hist = [...t.versions].sort((a, b) => b.version - a.version);

  return (
    <div className="dback" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="drawer" aria-label={t.name}>
        <div className="dh">
          <div><div className="dm">{t.ctx}</div><div className="dt2">{t.name}</div></div>
          <button className="x" style={{ fontSize: 22 }} onClick={onClose} aria-label="Close">×</button>
        </div>
        {ex && (
          <div className="explain">
            <div className="exh">What it is</div><div>{ex.what_it_is}</div>
            <div className="exh" style={{ marginTop: 8 }}>Why it matters to you</div><div>{ex.why_it_matters}</div>
          </div>
        )}

        <div className="dsec">
          <div className="dsh"><h4>Summary</h4>{current && <span className="dm">v{current.version} · {current.by_name} · {fmtDateTime(current.at)}</span>}</div>
          {auto ? <div className="dm">{current ? "Read automatically from the workbook. Nobody types these." : "Nothing to show until the workbook is uploaded. Its figures are read automatically."}</div>
            : !current ? <div className="dm">Not uploaded yet. Whoever uploads it adds {fields.length} quick figure{fields.length === 1 ? "" : "s"}: {fields.map((f) => f.label.toLowerCase()).join(", ")}.</div>
            : editing ? (
              <>
                <div className="mform">
                  {fields.map((f) => (
                    <label key={f.label}>{f.label}
                      <input value={draft[f.label] ?? ""} placeholder={f.type === "amount" ? "₹" : f.type === "number" ? "Number" : f.type === "date" ? "e.g. 18 Oct" : ""} onChange={(e) => setDraft({ ...draft, [f.label]: e.target.value })} />
                    </label>
                  ))}
                </div>
                {err && <div className="dm" style={{ color: "#b3261e" }}>{err}</div>}
                <div className="next">
                  <button className="b solid xs" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save summary"}</button>
                  {t.values.length > 0 && <button className="b quiet xs" onClick={() => setEditing(false)}>Cancel</button>}
                </div>
                <div className="dm">Two to four figures typed by whoever uploads the file. They show here and, later, on the dashboard.</div>
              </>
            ) : (
              <>
                <div className="mgrid">{fields.map((f) => <div key={f.label}><span>{f.label}</span><b>{t.values.find((v) => v.field === f.label)?.value || "—"}</b></div>)}</div>
                <div className="dm" style={{ marginTop: 6 }}>Entered by {t.values[0]?.entered_by_name ?? "someone"} when uploading · <a className="lnk" onClick={() => setEditing(true)}>Edit</a></div>
              </>
            )}
        </div>

        {current && (
          <div className="dsec">
            <div className="dsh"><h4>The file</h4><a className="lnk" onClick={() => openFile(true)}>Open full view</a></div>
            {url && isPdf(current.filename) ? <iframe title={current.filename} src={url} style={{ width: "100%", height: 260, border: "1px solid #efe9db", borderRadius: 8 }} />
              : url && isImg(current.filename) ? <img src={url} alt={current.filename} style={{ width: "100%", borderRadius: 8, border: "1px solid #efe9db" }} />
              : <div className="drop up"><div className="dn"><b>{current.filename}</b><div className="dm">{url ? "Preview isn't available for this file type." : "Preview the file here, or open it in a new tab."}</div></div>{!url && <button className="b quiet xs" onClick={() => openFile(false)}>Preview</button>}<button className="b quiet xs" onClick={() => openFile(true)}>Download</button></div>}
          </div>
        )}

        {ex && (
          <Expander title="How it works" open>
            <div className="how">
              {([["Who", t.ownerLabel], ["When", t.dueText ?? ""], ["Where it comes from", ex.where_from ?? ""], ["What Prime Bottomline checks", ex.what_pba_checks ?? ""], ["If it is late", ex.if_late ?? ""]] as [string, string][])
                .filter((r) => r[1]).map(([a, b], i) => (
                <div className="hstep" key={a}><span className="hn">{i + 1}</span><div><b>{a}</b><div>{b}</div></div></div>
              ))}
            </div>
          </Expander>
        )}

        <div className="dsec">
          <div className="dsh"><h4>File{hist.filter((h) => !h.removed).length > 1 ? "s" : ""}</h4><span className="dm">{hist.length ? `uploaded ${hist.filter((h) => !h.removed || true).length} time${hist.length > 1 ? "s" : ""}` : "none yet"}</span></div>
          {hist.length === 0 ? <div className="dm">No file yet.</div> : (
            <div className="hist">
              {hist.map((h) => (
                <div key={h.id} className={`hrow ${current?.id === h.id ? "cur" : ""} ${h.removed ? "rem" : ""}`}>
                  <span className="hv">{h.removed ? "Removed" : `v${h.version}`}</span>
                  <span className="hd">{h.version > 1 ? "Replaced" : "Uploaded"} by {h.by_name} · {fmtDateTime(h.at)}{h.reason ? ` — “${h.reason}”` : ""} <span className="hf">{h.filename}</span></span>
                  {current?.id === h.id && <span className="chip ok">Current</span>}
                </div>
              ))}
            </div>
          )}
          <div className="next">
            {current ? (<><button className="b quiet xs" onClick={() => onUpload(true)}>Replace</button><button className="b quiet xs danger-t" onClick={onRemove}>Remove</button></>)
              : <button className="b solid xs" onClick={() => onUpload(false)}>Upload</button>}
          </div>
        </div>
        <div style={{ marginTop: 14 }}><Own owner={t.owner} label={t.ownerLabel} /></div>
      </aside>
    </div>
  );
}
