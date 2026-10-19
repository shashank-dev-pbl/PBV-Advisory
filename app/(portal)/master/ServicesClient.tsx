"use client";

import { unwrap } from "@/lib/actionResult";
import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { safeStorageSegment } from "@/lib/storagePath";
import { getSignedDownloadUrl } from "@/app/founder/actions";
import { ENTITY_TYPES, INDIAN_STATES, TDS_FORMS, resolveItrBasis, type FilingType, type ItrBasis } from "@/lib/compliance";
import { closeRegistration, saveServices, uploadMasterDocument } from "./actions";

export type MasterDoc = { id: string; kind: "gst" | "tan" | "coi"; filename: string; storage_path: string; uploaded_by_name: string | null; uploaded_at: string; registration_id: string | null };
export type RegRow = { id: string; kind: "gst" | "tan" | "entity" | "custom"; identifier: string; state: string | null; filing_type: string | null; forms: string[]; status: "active" | "closed"; confirmed_by_name: string | null; confirmed_at: string; entries: number };
export type LogRow = { id: string; at: string; who_name: string | null; note: string; result: string | null };
export type ServiceSetting = { entity_type: string | null; effective_from: string | null; start_fy: number; itr_basis: ItrBasis };

const KIND_LABEL = { gst: "GST registration certificate", tan: "TAN allotment letter", coi: "Certificate of incorporation" } as const;
const box = { background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 10 } as const;
const green = { background: "var(--bottomline-green)", color: "var(--paper)", border: "1px solid var(--bottomline-green)" } as const;
const quiet = { background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)" } as const;
const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const upload = async (companyId: string, f: File) => {
  const path = `${companyId}/dataroom/${Date.now()}-${safeStorageSegment(f.name)}`;
  const { error } = await createClient().storage.from("docs").upload(path, f);
  if (error) throw error;
  return path;
};

type GstDraft = { gstin: string; state: string; filing: FilingType; file: File | null };
type TanDraft = { tan: string; forms: string[]; file: File | null };

function Pill({ on }: { on: boolean }) {
  return <span className="px-2 py-0.5 text-[11px] font-semibold" style={{ borderRadius: 5, background: on ? "#e4ece0" : "#f1ece0", color: on ? "#004d00" : "#6b6357" }}>{on ? "On" : "Off"}</span>;
}

export default function ServicesClient({ companyId, canEdit, setting, regs, docs, log }: {
  companyId: string; canEdit: boolean; setting: ServiceSetting; regs: RegRow[]; docs: MasterDoc[]; log: LogRow[];
}) {
  const activeGst = regs.filter((r) => r.kind === "gst" && r.status === "active");
  const activeTan = regs.filter((r) => r.kind === "tan" && r.status === "active");
  const entityActive = regs.some((r) => r.kind === "entity" && r.status === "active");

  const [fy, setFy] = useState(String(setting.start_fy));
  const [from, setFrom] = useState(setting.effective_from ?? "");
  const [entity, setEntity] = useState(setting.entity_type ?? "");
  const [basis, setBasis] = useState<ItrBasis>(setting.itr_basis);
  const [trackItr, setTrackItr] = useState(entityActive);
  const [gst, setGst] = useState<GstDraft[]>([]);
  const [tan, setTan] = useState<TanDraft[]>([]);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function save() {
    setBusy(true); setErr(""); setMsg("");
    try {
      const gstIn = [];
      for (const g of gst) {
        const cert = g.file ? { certPath: await upload(companyId, g.file), certName: g.file.name } : {};
        gstIn.push({ gstin: g.gstin, state: g.state, filingType: g.filing, ...cert });
      }
      const tanIn = [];
      for (const t of tan) {
        const cert = t.file ? { certPath: await upload(companyId, t.file), certName: t.file.name } : {};
        tanIn.push({ tan: t.tan, forms: t.forms, ...cert });
      }
      const { created } = unwrap(await saveServices({
        startFy: Number(fy), effectiveFrom: from || null, entityType: entity || null, itrBasis: basis, trackItr, gst: gstIn, tan: tanIn, note: why,
      }));
      setMsg(`Saved. ${created} new compliance ${created === 1 ? "entry" : "entries"} added.`);
      setGst([]); setTan([]); setWhy("");
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not save"); }
    setBusy(false);
  }

  const basisLabel = { audit: "audit, 31 Oct", non_audit: "non-audit, 31 Jul", tp: "transfer pricing, 30 Nov" }[resolveItrBasis({ itr_basis: basis, entity_type: entity || null })];

  return (
    <div className="grid gap-5">
      {!canEdit && (
        <div className="p-3.5 text-[13px]" style={{ background: "#eef3ec", border: "1px solid #cfdccd", color: "#004d00" }}>
          This is what is being tracked for you. Your practitioner sets it up. You can add documents at the bottom of this page.
        </div>
      )}

      <section className="p-4" style={box}>
        <h2 className="mb-3 text-[14px] font-bold">Tracking</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-[12px] font-semibold">Entity type
            <select className="input-field mt-1" disabled={!canEdit} value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option value="">Choose…</option>{ENTITY_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label className="text-[12px] font-semibold">Incorporation / effective from (optional)
            <input type="date" className="input-field mt-1" disabled={!canEdit} value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="mt-1 block text-[11px] font-normal" style={{ color: "var(--ink-secondary)" }}>Periods ending before this date are not generated.</span></label>
          <label className="text-[12px] font-semibold">Start tracking from
            <select className="input-field mt-1" disabled={!canEdit} value={fy} onChange={(e) => setFy(e.target.value)}>
              {[2020, 2021, 2022, 2023, 2024, 2025, 2026].map((y) => <option key={y} value={y}>FY {y}-{String(y + 1).slice(-2)}{y === 2024 ? " (default)" : ""}</option>)}</select>
            <span className="mt-1 block text-[11px] font-normal" style={{ color: "var(--ink-secondary)" }}>An earlier year brings in history. Nothing is deleted.</span></label>
        </div>
      </section>

      <section className="p-4" style={box}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[14px] font-bold">GST <span className="ml-2"><Pill on={activeGst.length > 0} /></span></h2>
          {canEdit && <button className="btn-small" style={quiet} onClick={() => setGst([...gst, { gstin: "", state: "", filing: "regular", file: null }])}>+ Add GSTIN</button>}
        </div>
        <p className="mb-2 text-[12px]" style={{ color: "var(--ink-secondary)" }}>GSTR-1 and GSTR-3B every month, GSTR-9 every year, for each GSTIN.</p>
        <RegList rows={activeGst} canEdit={canEdit} />
        {gst.map((g, i) => (
          <div key={i} className="mt-3 grid items-end gap-3 border-t pt-3 md:grid-cols-4" style={{ borderColor: "var(--rule)" }}>
            <label className="text-[12px] font-semibold">GSTIN<input className="input-field mt-1" maxLength={15} placeholder="29ABCDE1234F1Z5" value={g.gstin} onChange={(e) => setGst(gst.map((x, j) => (j === i ? { ...x, gstin: e.target.value.toUpperCase() } : x)))} /></label>
            <label className="text-[12px] font-semibold">State
              <select className="input-field mt-1" value={g.state} onChange={(e) => setGst(gst.map((x, j) => (j === i ? { ...x, state: e.target.value } : x)))}><option value="">Choose…</option>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</select></label>
            <label className="text-[12px] font-semibold">Filing type
              <select className="input-field mt-1" value={g.filing} onChange={(e) => setGst(gst.map((x, j) => (j === i ? { ...x, filing: e.target.value as FilingType } : x)))}>
                <option value="regular">Regular</option><option value="qrmp">QRMP (not set up yet)</option><option value="composition">Composition (not set up yet)</option></select></label>
            <div className="flex items-center gap-2">
              <label className="btn-small cursor-pointer" style={quiet}>{g.file ? g.file.name.slice(0, 18) : "Attach certificate"}
                <input type="file" hidden onChange={(e) => setGst(gst.map((x, j) => (j === i ? { ...x, file: e.target.files?.[0] ?? null } : x)))} /></label>
              <button className="btn-small" style={quiet} onClick={() => setGst(gst.filter((_, j) => j !== i))}>Remove</button>
            </div>
          </div>
        ))}
      </section>

      <section className="p-4" style={box}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[14px] font-bold">TDS <span className="ml-2"><Pill on={activeTan.length > 0} /></span></h2>
          {canEdit && <button className="btn-small" style={quiet} onClick={() => setTan([...tan, { tan: "", forms: [], file: null }])}>+ Add TAN</button>}
        </div>
        <p className="mb-2 text-[12px]" style={{ color: "var(--ink-secondary)" }}>A payment due on the 7th every month, and a return for each form every quarter.</p>
        <RegList rows={activeTan} canEdit={canEdit} />
        {tan.map((t, i) => (
          <div key={i} className="mt-3 grid items-end gap-3 border-t pt-3 md:grid-cols-3" style={{ borderColor: "var(--rule)" }}>
            <label className="text-[12px] font-semibold">TAN<input className="input-field mt-1" maxLength={10} placeholder="BLRA12345B" value={t.tan} onChange={(e) => setTan(tan.map((x, j) => (j === i ? { ...x, tan: e.target.value.toUpperCase() } : x)))} /></label>
            <div className="text-[12px] font-semibold">Forms
              <div className="mt-2 flex flex-wrap gap-3">
                {TDS_FORMS.map((f) => (
                  <label key={f} className="flex items-center gap-1.5 text-[13px] font-normal">
                    <input type="checkbox" checked={t.forms.includes(f)} onChange={(e) => setTan(tan.map((x, j) => (j === i ? { ...x, forms: e.target.checked ? [...x.forms, f] : x.forms.filter((y) => y !== f) } : x)))} />{f}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="btn-small cursor-pointer" style={quiet}>{t.file ? t.file.name.slice(0, 18) : "Attach TAN letter"}
                <input type="file" hidden onChange={(e) => setTan(tan.map((x, j) => (j === i ? { ...x, file: e.target.files?.[0] ?? null } : x)))} /></label>
              <button className="btn-small" style={quiet} onClick={() => setTan(tan.filter((_, j) => j !== i))}>Remove</button>
            </div>
          </div>
        ))}
      </section>

      <section className="p-4" style={box}>
        <h2 className="mb-1 text-[14px] font-bold">Income tax return <span className="ml-2"><Pill on={entityActive} /></span></h2>
        <p className="mb-3 text-[12px]" style={{ color: "var(--ink-secondary)" }}>One return a year. The due date follows the basis.</p>
        <div className="grid items-end gap-3 md:grid-cols-3">
          <label className="flex items-center gap-2 text-[13px] font-semibold">
            <input type="checkbox" disabled={!canEdit} checked={trackItr} onChange={(e) => setTrackItr(e.target.checked)} /> Track the income tax return
          </label>
          <label className="text-[12px] font-semibold">Filing basis
            <select className="input-field mt-1" disabled={!canEdit} value={basis} onChange={(e) => setBasis(e.target.value as ItrBasis)}>
              <option value="auto">Automatic by entity type</option><option value="non_audit">Non-audit (31 Jul)</option><option value="audit">Audit (31 Oct)</option><option value="tp">Transfer pricing (30 Nov)</option></select></label>
          <p className="text-[12px]" style={{ color: "var(--ink-secondary)" }}>{entity || basis !== "auto" ? `Uses ${basisLabel}.` : "Choose the entity type above."}</p>
        </div>
        {entityActive && canEdit && regs.filter((r) => r.kind === "entity" && r.status === "active").map((r) => <div key={r.id} className="mt-3"><RegList rows={[r]} canEdit /></div>)}
      </section>

      <section className="p-4" style={box}>
        <h2 className="mb-1 text-[14px] font-bold">Not set up yet</h2>
        <p className="text-[12px]" style={{ color: "var(--ink-secondary)" }}>ROC and director KYC, PF, professional tax, labour welfare, POSH, audit and FEMA/RBI. Their rules are waiting for the company secretary. For anything else, add a custom type.</p>
      </section>

      {canEdit && (
        <section className="p-4" style={box}>
          <label className="text-[12px] font-semibold">Why this change? (optional)
            <input className="input-field mt-1" placeholder="Shown in the change history" value={why} onChange={(e) => setWhy(e.target.value)} /></label>
          {err && <p className="mt-2 text-[12.5px]" style={{ color: "#8c1a1a" }}>{err}</p>}
          {msg && <p className="mt-2 text-[12.5px]" style={{ color: "#004d00" }}>{msg}</p>}
          <button className="btn-small mt-3" style={green} disabled={busy} onClick={save}>{busy ? "Saving…" : "Save and generate"}</button>
          <span className="ml-3 text-[12px]" style={{ color: "var(--ink-secondary)" }}>Adds only the entries that are missing.</span>
        </section>
      )}

      <Documents companyId={companyId} docs={docs} />

      <section>
        <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.1em]">Change history</h2>
        <div className="p-3.5" style={box}>
          {log.length === 0 ? <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>Nothing recorded yet.</p> : log.map((l) => (
            <p key={l.id} className="py-1 text-[12.5px]"><span style={{ color: "var(--ink-secondary)" }}>{fmt(l.at)} · {l.who_name} · </span>{l.note}{l.result ? <b> — {l.result}</b> : null}</p>
          ))}
        </div>
      </section>
    </div>
  );
}

export function RegList({ rows, canEdit }: { rows: RegRow[]; canEdit: boolean }) {
  if (rows.length === 0) return <p className="text-[12.5px]" style={{ color: "var(--ink-secondary)" }}>None yet.</p>;
  return <div className="grid gap-1.5">{rows.map((r) => <RegLine key={r.id} r={r} canEdit={canEdit} />)}</div>;
}

function RegLine({ r, canEdit }: { r: RegRow; canEdit: boolean }) {
  const [stopping, setStopping] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const title = r.kind === "gst" ? `${r.identifier} · ${r.state}` : r.kind === "tan" ? `${r.identifier} · forms ${r.forms.join(", ")}` : r.kind === "entity" ? "Income tax return" : r.identifier;
  return (
    <div className="border-b py-1.5" style={{ borderColor: "var(--rule)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">{title}</p>
          <p className="text-[11.5px]" style={{ color: "var(--ink-secondary)" }}>{r.entries} entries · confirmed by {r.confirmed_by_name} · {fmt(r.confirmed_at)}</p>
        </div>
        {canEdit && <button className="btn-small" style={quiet} onClick={() => setStopping((v) => !v)}>Stop tracking</button>}
      </div>
      {stopping && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input className="input-field" style={{ maxWidth: 360 }} placeholder="Why? e.g. registration cancelled" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn-small" style={{ background: "#8c1a1a", color: "#fff", border: "1px solid #8c1a1a" }} disabled={pending}
            onClick={() => start(async () => { try { unwrap(await closeRegistration(r.id, reason)); setStopping(false); } catch (e) { setErr(e instanceof Error ? e.message : "Could not stop tracking"); } })}>
            {pending ? "Stopping…" : "Stop tracking"}</button>
          <span className="text-[12px]" style={{ color: "var(--ink-secondary)" }}>Open entries are closed and kept in history. Nothing is deleted.</span>
          {err && <span className="text-[12px]" style={{ color: "#8c1a1a" }}>{err}</span>}
        </div>
      )}
    </div>
  );
}

function Documents({ companyId, docs }: { companyId: string; docs: MasterDoc[] }) {
  const [kind, setKind] = useState<"gst" | "tan" | "coi">("coi");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy(true); setErr("");
    try { unwrap(await uploadMasterDocument(kind, await upload(companyId, f), f.name)); } catch (e) { setErr(e instanceof Error ? e.message : "Upload failed"); }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }
  return (
    <section className="p-4" style={box}>
      <h2 className="mb-1 text-[14px] font-bold">Documents</h2>
      <p className="mb-3 text-[12px]" style={{ color: "var(--ink-secondary)" }}>Adding a document only files it, and it also becomes the current copy in the data room. It does not change the calendar. The calendar changes only when the services above are saved.</p>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <select className="input-field" style={{ maxWidth: 300 }} value={kind} onChange={(e) => setKind(e.target.value as "gst" | "tan" | "coi")}>
          {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
        <input ref={fileRef} type="file" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <button className="btn-small" style={green} disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? "Uploading…" : "Add document"}</button>
      </div>
      {err && <p className="mb-2 text-[12.5px]" style={{ color: "#8c1a1a" }}>{err}</p>}
      {docs.length === 0 ? <p className="text-[12.5px]" style={{ color: "var(--ink-secondary)" }}>No documents yet.</p> : docs.map((d) => (
        <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-1.5" style={{ borderColor: "var(--rule)" }}>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold">{KIND_LABEL[d.kind]}</p>
            <p className="text-[11.5px]" style={{ color: "var(--ink-secondary)" }}>{d.filename} · {d.uploaded_by_name} · {fmt(d.uploaded_at)}{d.registration_id ? " · attached to a registration" : ""}</p>
          </div>
          <button className="btn-small" style={quiet} onClick={async () => window.open(await getSignedDownloadUrl(d.storage_path), "_blank")}>View</button>
        </div>
      ))}
    </section>
  );
}
