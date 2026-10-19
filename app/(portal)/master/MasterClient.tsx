"use client";

import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { safeStorageSegment } from "@/lib/storagePath";
import { getSignedDownloadUrl } from "@/app/founder/actions";
import { ENTITY_TYPES, INDIAN_STATES, TDS_FORMS, resolveItrBasis, type FilingType, type ItrBasis, type Setting } from "@/lib/compliance";
import { closeRegistration, confirmMasterDocument, saveComplianceSettings, uploadMasterDocument, type ConfirmInput } from "./actions";

export type MasterDoc = { id: string; kind: "gst" | "tan" | "coi"; filename: string; storage_path: string; uploaded_by_name: string | null; uploaded_at: string; registration_id: string | null };
export type RegRow = { id: string; kind: "gst" | "tan" | "entity"; identifier: string; state: string | null; filing_type: string | null; forms: string[]; status: "active" | "closed"; confirmed_by_name: string | null; confirmed_at: string; entries: number };
export type LogRow = { id: string; at: string; who_name: string | null; note: string; result: string | null };

const KIND_LABEL = { gst: "GST registration certificate", tan: "TAN allotment letter", coi: "Certificate of incorporation" } as const;
const KIND_HINT = {
  gst: "GSTR-1 and GSTR-3B every month, GSTR-9 every year, for each GSTIN",
  tan: "A TDS payment every month and a return for each form every quarter",
  coi: "Sets the entity type and start date, and the income tax return",
} as const;
const box = { background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 10 } as const;
const green = { background: "var(--bottomline-green)", color: "var(--paper)", border: "1px solid var(--bottomline-green)" } as const;
const quiet = { background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)" } as const;
const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function MasterClient({ companyId, canConfirm, docs, regs, setting, log }: {
  companyId: string; canConfirm: boolean; docs: MasterDoc[]; regs: RegRow[]; setting: Setting; log: LogRow[];
}) {
  const [kind, setKind] = useState<"gst" | "tan" | "coi">("gst");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = docs.filter((d) => !d.registration_id);
  const done = docs.filter((d) => d.registration_id);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy(true); setErr(""); setNote("");
    try {
      const path = `${companyId}/dataroom/${Date.now()}-${safeStorageSegment(f.name)}`;
      const { error } = await createClient().storage.from("docs").upload(path, f);
      if (error) throw error;
      await uploadMasterDocument(kind, path, f.name);
      setNote(canConfirm ? "Uploaded. Confirm the details below to generate the compliance calendar." : "Uploaded. Your practitioner will confirm the details and the calendar is generated from there.");
    } catch (e) { setErr(e instanceof Error ? e.message : "Upload failed"); }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="grid gap-6">
      {!canConfirm && (
        <div className="p-3.5 text-[13px]" style={{ background: "#eef3ec", border: "1px solid #cfdccd", color: "#004d00" }}>
          You can upload these documents. Your practitioner confirms what they say, and that is what builds the compliance calendar.
        </div>
      )}

      <section className="p-4" style={box}>
        <h2 className="mb-1 text-[14px] font-bold">Add a master document</h2>
        <p className="mb-3 text-[12px]" style={{ color: "var(--ink-secondary)" }}>Uploading only files the document. Nothing is generated until the details are confirmed.</p>
        <div className="flex flex-wrap items-center gap-3">
          <select className="input-field" style={{ maxWidth: 320 }} value={kind} onChange={(e) => setKind(e.target.value as "gst" | "tan" | "coi")}>
            {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
          <input ref={fileRef} type="file" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <button className="btn-small" style={green} disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? "Uploading…" : "Choose file and upload"}</button>
        </div>
        <p className="mt-2 text-[12px]" style={{ color: "var(--ink-secondary)" }}>{KIND_HINT[kind]}.</p>
        {note && <p className="mt-2 text-[12.5px]" style={{ color: "#004d00" }}>{note}</p>}
        {err && <p className="mt-2 text-[12.5px]" style={{ color: "#8c1a1a" }}>{err}</p>}
      </section>

      {pending.length > 0 && (
        <section>
          <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.1em]">Waiting for details</h2>
          <div className="grid gap-2.5">
            {pending.map((d) => (
              <div key={d.id} className="p-3.5" style={box}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold">{KIND_LABEL[d.kind]}</p>
                    <p className="text-[12px]" style={{ color: "var(--ink-secondary)" }}>{d.filename} · {d.uploaded_by_name} · {fmt(d.uploaded_at)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-small" style={quiet} onClick={async () => window.open(await getSignedDownloadUrl(d.storage_path), "_blank")}>View file</button>
                    {canConfirm
                      ? <button className="btn-small" style={green} onClick={() => setOpen(open === d.id ? null : d.id)}>{open === d.id ? "Close" : "Confirm details"}</button>
                      : <span className="self-center text-[12px]" style={{ color: "var(--ink-secondary)" }}>Waiting for your practitioner</span>}
                  </div>
                </div>
                {canConfirm && open === d.id && <ConfirmForm doc={d} onDone={() => setOpen(null)} />}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.1em]">What is being tracked</h2>
        {regs.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>Nothing yet. Upload a document above and confirm its details.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ ...box, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--rule)" }}>
                  {["Registration", "Details", "Entries", "Confirmed", ""].map((h) => <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--ink-secondary)" }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {regs.map((r) => <RegLine key={r.id} r={r} canConfirm={canConfirm} />)}
              </tbody>
            </table>
          </div>
        )}
        {done.length > 0 && <p className="mt-2 text-[12px]" style={{ color: "var(--ink-secondary)" }}>{done.length} confirmed document{done.length === 1 ? "" : "s"} on file. They are also in the data room under Standard documents.</p>}
      </section>

      {canConfirm && <SettingsForm setting={setting} hasRegs={regs.length > 0} start={start} />}

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

function RegLine({ r, canConfirm }: { r: RegRow; canConfirm: boolean }) {
  const [stopping, setStopping] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const label = r.kind === "gst" ? "GSTIN" : r.kind === "tan" ? "TAN" : "Entity";
  const detail = r.kind === "gst" ? `${r.state} · ${r.filing_type}` : r.kind === "tan" ? `Forms ${r.forms.join(", ")}` : r.identifier === "ENTITY" ? "Income tax return" : "Income tax return";
  return (
    <>
      <tr style={{ borderBottom: "1px solid var(--rule)", opacity: r.status === "closed" ? 0.55 : 1 }}>
        <td className="px-3 py-2.5 text-[13px] font-semibold">{label}{r.kind !== "entity" ? ` ${r.identifier}` : ""}{r.status === "closed" ? " (stopped)" : ""}</td>
        <td className="px-3 py-2.5 text-[13px]">{detail}</td>
        <td className="px-3 py-2.5 text-[13px]">{r.entries}</td>
        <td className="px-3 py-2.5 text-[12px]" style={{ color: "var(--ink-secondary)" }}>{r.confirmed_by_name} · {fmt(r.confirmed_at)}</td>
        <td className="px-3 py-2.5 text-right">
          {canConfirm && r.status === "active" && <button className="btn-small" style={quiet} onClick={() => setStopping((v) => !v)}>Stop tracking</button>}
        </td>
      </tr>
      {stopping && (
        <tr><td colSpan={5} className="px-3 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <input className="input-field" style={{ maxWidth: 360 }} placeholder="Why? e.g. GST registration cancelled" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button className="btn-small" style={{ background: "#8c1a1a", color: "#fff", border: "1px solid #8c1a1a" }} disabled={pending}
              onClick={() => start(async () => { try { await closeRegistration(r.id, reason); setStopping(false); } catch (e) { setErr(e instanceof Error ? e.message : "Could not stop tracking"); } })}>
              {pending ? "Stopping…" : "Stop tracking"}
            </button>
            <span className="text-[12px]" style={{ color: "var(--ink-secondary)" }}>Open entries are closed and kept in history. Nothing is deleted.</span>
          </div>
          {err && <p className="mt-1 text-[12px]" style={{ color: "#8c1a1a" }}>{err}</p>}
        </td></tr>
      )}
    </>
  );
}

function ConfirmForm({ doc, onDone }: { doc: MasterDoc; onDone: () => void }) {
  const [gstin, setGstin] = useState("");
  const [state, setState] = useState("");
  const [filing, setFiling] = useState<FilingType>("regular");
  const [tan, setTan] = useState("");
  const [forms, setForms] = useState<string[]>([]);
  const [entity, setEntity] = useState("");
  const [date, setDate] = useState("");
  const [cin, setCin] = useState("");
  const [err, setErr] = useState("");
  const [result, setResult] = useState("");
  const [pending, start] = useTransition();

  function save() {
    setErr("");
    const input: ConfirmInput =
      doc.kind === "gst" ? { docId: doc.id, kind: "gst", gstin, state, filingType: filing }
      : doc.kind === "tan" ? { docId: doc.id, kind: "tan", tan, forms }
      : { docId: doc.id, kind: "coi", entityType: entity, incorporatedOn: date, cin };
    start(async () => {
      try {
        const { created } = await confirmMasterDocument(input);
        setResult(`Saved. ${created} new compliance ${created === 1 ? "entry" : "entries"} added.`);
        setTimeout(onDone, 1200);
      } catch (e) { setErr(e instanceof Error ? e.message : "Could not save"); }
    });
  }

  return (
    <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--rule)" }}>
      <p className="mb-2 text-[12px]" style={{ color: "var(--ink-secondary)" }}>Read these from the document. Saving generates the calendar.</p>
      <div className="grid gap-3 md:grid-cols-3">
        {doc.kind === "gst" && (<>
          <label className="text-[12px] font-semibold">GSTIN<input className="input-field mt-1" maxLength={15} placeholder="29ABCDE1234F1Z5" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} /></label>
          <label className="text-[12px] font-semibold">State
            <select className="input-field mt-1" value={state} onChange={(e) => setState(e.target.value)}><option value="">Choose…</option>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className="text-[12px] font-semibold">Filing type
            <select className="input-field mt-1" value={filing} onChange={(e) => setFiling(e.target.value as FilingType)}>
              <option value="regular">Regular</option><option value="qrmp">QRMP (not set up yet)</option><option value="composition">Composition (not set up yet)</option></select></label>
        </>)}
        {doc.kind === "tan" && (<>
          <label className="text-[12px] font-semibold">TAN<input className="input-field mt-1" maxLength={10} placeholder="BLRA12345B" value={tan} onChange={(e) => setTan(e.target.value.toUpperCase())} /></label>
          <div className="text-[12px] font-semibold md:col-span-2">Forms filed
            <div className="mt-2 flex flex-wrap gap-3">
              {TDS_FORMS.map((f) => (
                <label key={f} className="flex items-center gap-1.5 text-[13px] font-normal">
                  <input type="checkbox" checked={forms.includes(f)} onChange={(e) => setForms(e.target.checked ? [...forms, f] : forms.filter((x) => x !== f))} />{f}
                </label>
              ))}
            </div>
          </div>
        </>)}
        {doc.kind === "coi" && (<>
          <label className="text-[12px] font-semibold">Entity type
            <select className="input-field mt-1" value={entity} onChange={(e) => setEntity(e.target.value)}><option value="">Choose…</option>{ENTITY_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label className="text-[12px] font-semibold">Date of incorporation<input type="date" className="input-field mt-1" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="text-[12px] font-semibold">CIN (optional)<input className="input-field mt-1" value={cin} onChange={(e) => setCin(e.target.value.toUpperCase())} /></label>
        </>)}
      </div>
      {err && <p className="mt-2 text-[12.5px]" style={{ color: "#8c1a1a" }}>{err}</p>}
      {result && <p className="mt-2 text-[12.5px]" style={{ color: "#004d00" }}>{result}</p>}
      <button className="btn-small mt-3" style={green} disabled={pending} onClick={save}>{pending ? "Saving…" : "Save and generate"}</button>
    </div>
  );
}

function SettingsForm({ setting, hasRegs, start }: { setting: Setting; hasRegs: boolean; start: ReturnType<typeof useTransition>[1] }) {
  const [fy, setFy] = useState(String(setting.start_fy));
  const [basis, setBasis] = useState<ItrBasis>(setting.itr_basis);
  const [from, setFrom] = useState(setting.effective_from ?? "");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const resolved = resolveItrBasis({ itr_basis: basis, entity_type: setting.entity_type });
  const label = { audit: "audit (31 Oct)", non_audit: "non-audit (31 Jul)", tp: "transfer pricing (30 Nov)" }[resolved];
  return (
    <section className="p-4" style={box}>
      <h2 className="mb-1 text-[14px] font-bold">Tracking settings</h2>
      <p className="mb-3 text-[12px]" style={{ color: "var(--ink-secondary)" }}>Choose how far back the calendar starts and which income tax return applies. Saving adds only what is missing.</p>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-[12px] font-semibold">Start tracking from
          <select className="input-field mt-1" value={fy} onChange={(e) => setFy(e.target.value)}>
            {[2020, 2021, 2022, 2023, 2024, 2025, 2026].map((y) => <option key={y} value={y}>FY {y}-{String(y + 1).slice(-2)}{y === 2024 ? " (default)" : ""}</option>)}
          </select></label>
        <label className="text-[12px] font-semibold">Effective from (optional)
          <input type="date" className="input-field mt-1" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="mt-1 block text-[11px] font-normal" style={{ color: "var(--ink-secondary)" }}>Periods ending before this date are not generated.</span></label>
        <label className="text-[12px] font-semibold">Income tax return basis
          <select className="input-field mt-1" value={basis} onChange={(e) => setBasis(e.target.value as ItrBasis)}>
            <option value="auto">Automatic by entity type</option><option value="non_audit">Non-audit (31 Jul)</option><option value="audit">Audit (31 Oct)</option><option value="tp">Transfer pricing (30 Nov)</option>
          </select>
          <span className="mt-1 block text-[11px] font-normal" style={{ color: "var(--ink-secondary)" }}>{setting.entity_type || basis !== "auto" ? `Uses ${label}.` : "Confirm the certificate of incorporation to set the entity type."}</span></label>
      </div>
      {err && <p className="mt-2 text-[12.5px]" style={{ color: "#8c1a1a" }}>{err}</p>}
      {msg && <p className="mt-2 text-[12.5px]" style={{ color: "#004d00" }}>{msg}</p>}
      <button className="btn-small mt-3" style={green}
        onClick={() => start(async () => {
          setErr(""); setMsg("");
          try {
            const { created } = await saveComplianceSettings({ startFy: Number(fy), itrBasis: basis, effectiveFrom: from || null, entityType: setting.entity_type });
            setMsg(hasRegs ? `Saved. ${created} new compliance ${created === 1 ? "entry" : "entries"} added.` : "Saved. Entries are generated once a registration is confirmed.");
          } catch (e) { setErr(e instanceof Error ? e.message : "Could not save"); }
        })}>Save settings</button>
    </section>
  );
}
