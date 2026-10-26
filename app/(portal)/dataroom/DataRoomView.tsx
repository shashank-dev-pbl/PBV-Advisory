"use client";

import "../proto.css";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { safeStorageSegment } from "@/lib/storagePath";
import { unwrap } from "@/lib/actionResult";
import { fmtDate } from "@/lib/dates";
import { buildPlan, booksOwner, type EngineData } from "@/lib/master/engine";
import type { Answers, Owner } from "@/lib/master/types";
import { CAT_COLOUR, CAT_NAME, EVENT_DOC_EXPLAINER, roomEvents, standardGroups, timelineYears, type RoomEvent } from "@/lib/dataroom/model";
import { recordFile, removeFile } from "../company-master/actions";
import Drawer, { type SummaryValue } from "../company-master/Drawer";
import { Modal, type ModalState } from "../company-master/ui";
import type { Explainer, FileRow, LogItem, SummaryRow } from "../company-master/MasterWizard";

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));
const FOUNDER_CODES = new Set(["COI", "PAN", "TAN"]);

export default function DataRoomView({ companyId, meName, firmName, answers, data, explainers, files, summaries, log }: {
  companyId: string; meName: string; firmName: string | null; answers: Answers; data: EngineData; explainers: Explainer[]; files: FileRow[]; summaries: SummaryRow[]; log: LogItem[];
}) {
  const today = useMemo(() => new Date(), []);
  const plan = useMemo(() => buildPlan(answers, data, today), [answers, data, today]);
  const closer = booksOwner(answers);
  const ownLabel = (o: Owner) => (o === "founder" ? "Founder" : o === "pba" ? "PBA practitioner" : answers.books?.firmName || firmName || "External practitioner");
  const groups = useMemo(() => standardGroups(plan), [plan]);
  const events = useMemo(() => roomEvents(plan, (code) => (code && FOUNDER_CODES.has(code) ? "founder" : closer)), [plan, closer]);
  const ruleOf = useMemo(() => new Map(data.rules.map((r) => [r.rule_id, r])), [data.rules]);
  const explain = useMemo(() => new Map(explainers.map((e) => [e.doc_type, e])), [explainers]);

  const [tab, setTab] = useState<"std" | "tl" | "act">("std");
  const [fileRows, setFileRows] = useState<FileRow[]>(files);
  const [sums, setSums] = useState<SummaryRow[]>(summaries);
  const [sel, setSel] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [drawer, setDrawer] = useState<{ key: string; name: string; owner: Owner; code: string | null; justUploaded?: boolean } | null>(null);
  const [hist, setHist] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState<{ key: string; filename: string } | null>(null);
  const [err, setErr] = useState("");
  const [, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const pending = useRef<{ key: string; name: string; reason: string; owner: Owner; code: string | null } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el); return () => ro.disconnect();
  }, [tab]);

  const versionsOf = (key: string) => fileRows.filter((f) => f.req_key === key && !f.period).sort((a, b) => b.version - a.version);
  const currentOf = (key: string) => versionsOf(key).find((f) => !f.removed);

  /* ---- files (same keys as the master, so both places agree) ---- */
  function pickFile(key: string, name: string, reason: string, owner: Owner, code: string | null) { pending.current = { key, name, reason, owner, code }; setModal(null); fileInput.current?.click(); }
  function uploadAct(key: string, name: string, owner: Owner, code: string | null) {
    const up = currentOf(key);
    if (up) setModal({ title: `Replace ${name}?`, reason: true, confirm: "Replace file", body: <>The current file (version {up.version}, uploaded by {up.by_name ?? "—"}) stays in the history. The new file becomes version {up.version + 1} everywhere it is used — the master and the data room.</>, onOk: (r) => pickFile(key, name, r, owner, code) });
    else pickFile(key, name, "", owner, code);
  }
  function removeAct(key: string, name: string) {
    setModal({ title: `Remove ${name}?`, reason: true, danger: true, confirm: "Remove", body: <>It disappears from the data room and the master asks for it again. Nothing is deleted — every version stays in the history.</>,
      onOk: (r) => { setModal(null); start(async () => { try { unwrap(await removeFile(key, r || "Removed", null)); setFileRows((rows) => rows.map((f) => (f.req_key === key && !f.period && !f.removed ? { ...f, removed: true } : f))); } catch (e) { setErr(e instanceof Error ? e.message : "Could not remove"); } }); } });
  }
  async function onFile(f: File | undefined) {
    const p = pending.current;
    if (fileInput.current) fileInput.current.value = "";
    if (!f || !p) return;
    setErr(""); setUploading({ key: p.key, filename: f.name });
    try {
      const path = `${companyId}/master/${safeStorageSegment(p.key)}/${uid()}-${safeStorageSegment(f.name)}`;
      const { error } = await createClient().storage.from("docs").upload(path, f);
      if (error) throw error;
      unwrap(await recordFile({ reqKey: p.key, storagePath: path, filename: f.name, reason: p.reason || undefined, period: null }));
      const prev = versionsOf(p.key)[0];
      setFileRows((rows) => [{ id: uid(), req_key: p.key, period: null, version: (prev?.version ?? 0) + 1, storage_path: path, filename: f.name, by_name: meName, at: new Date().toISOString(), reason: p.reason || null, removed: false }, ...rows]);
      setDrawer({ key: p.key, name: p.name, owner: p.owner, code: p.code, justUploaded: true });
    } catch (e) { setErr(e instanceof Error ? e.message : "Upload failed"); }
    setUploading(null);
  }

  function docType(key: string, code: string | null): string {
    const rule = ruleOf.get(key.split(":")[0]);
    if (rule && rule.section === "standard") return rule.doc_type ?? "generic";
    return (code && EVENT_DOC_EXPLAINER[code]) || "generic";
  }
  function docCard(key: string, name: string, formCode: string | null, owner: Owner, libCode: string | null, src?: string) {
    if (uploading?.key === key) return <div className="dcard" key={key} role="status" aria-live="polite"><div className="dct"><div className="dn"><b>{name}</b><div className="dm"><span className="spin" />Uploading {uploading.filename}…</div></div><div className="dacts"><button className="b solid xs" disabled>Uploading…</button></div></div></div>;
    const up = currentOf(key); const n = versionsOf(key).length; const open = hist[key];
    return (
      <div className={`dcard ${up ? "" : "missing"}`} key={key}>
        <div className="dct">
          <div className="dn tap" onClick={() => setDrawer({ key, name, owner, code: libCode })}><b>{name}</b><span className="ib" title="What is this?">i</span>{formCode && <span className="fc">{formCode}</span>}
            <div className="dm">{up ? `v${up.version} · uploaded by ${up.by_name ?? "—"} · ${fmtDate(up.at)}` : answers.later?.[key.replace(/\./g, "_")] ? `Marked “later” · waiting on ${ownLabel(owner)}` : `Not uploaded · waiting on ${ownLabel(owner)}`}{src ? ` · from ${src}` : ""}</div></div>
          <div className="dacts">
            {n > 0 && <button className="cnt-chip" onClick={() => setHist({ ...hist, [key]: !open })} title="Every version kept">{n} upload{n > 1 ? "s" : ""} {open ? "▴" : "▾"}</button>}
            {up ? <><button className="b quiet xs" onClick={() => uploadAct(key, name, owner, libCode)}>Replace</button><button className="b quiet xs danger-t" onClick={() => removeAct(key, name)}>Remove</button></>
              : <button className="b solid xs" onClick={() => uploadAct(key, name, owner, libCode)}>Upload</button>}
          </div>
        </div>
        {open && <div className="hist">{versionsOf(key).map((h) => (
          <div key={h.id} className={`hrow ${currentOf(key)?.id === h.id ? "cur" : ""} ${h.removed ? "rem" : ""}`}><span className="hv">{h.removed ? "Removed" : `v${h.version}`}</span>
            <span className="hd">{h.version > 1 ? "Replaced" : "Uploaded"} by {h.by_name} · {fmtDate(h.at)}{h.reason ? ` — “${h.reason}”` : ""} <span className="hf">{h.filename}</span></span>{currentOf(key)?.id === h.id && <span className="chip ok">Current</span>}</div>))}</div>}
      </div>
    );
  }

  const evDone = (e: RoomEvent) => e.docs.filter((d) => currentOf(d.key)).length;
  const docCount = groups.reduce((n, g) => n + g.items.filter((i) => currentOf(i.key)).length, 0) + events.reduce((n, e) => n + e.docs.filter((d) => currentOf(d.key) && !d.key.startsWith("R")).length, 0);

  /* ---- timeline ---- */
  function timeline() {
    const dated = events.filter((e) => e.date);
    const years = timelineYears(answers, today);
    const start = new Date(`${years[0]}-01-01T00:00:00`), end = new Date(`${years[years.length - 1] + 1}-01-01T00:00:00`);
    const W = Math.max(760, width - 4);
    const x = (d: string) => 24 + (W - 48) * ((new Date(`${d}T00:00:00`).getTime() - start.getTime()) / (end.getTime() - start.getTime()));
    const laneEnd = [-1e9, -1e9, -1e9, -1e9], CW = 150, AX = 170;
    const items = dated.map((e, i) => {
      const cx = x(e.date!); let lane = [i % 2, (i + 1) % 2, 2 + (i % 2), 2 + ((i + 1) % 2)].find((l) => laneEnd[l] < cx - CW / 2 - 6); if (lane === undefined) lane = i % 4; laneEnd[lane] = cx + CW / 2;
      const up = lane % 2 === 0, far = lane >= 2, c = CAT_COLOUR[e.cat], tot = e.docs.length, done = evDone(e), p = tot ? done / tot : 1, on = sel === e.key;
      const stem = far ? 100 : 36, top = up ? AX - stem - 66 : AX + stem, left = Math.max(4, Math.min(W - CW - 4, cx - CW / 2));
      return (
        <div key={e.key}>
          <div className="stem" style={{ left: cx, top: up ? AX - stem : AX, height: stem, background: c }} />
          <div className={`node ${on ? "sel" : ""}`} style={{ left: cx, top: AX, ["--c" as string]: c, ["--p" as string]: `${Math.round(p * 360)}deg` }} onClick={() => setSel(e.key)}><span /></div>
          <div className={`evcard ${on ? "sel" : ""}`} style={{ left, top, ["--c" as string]: c }} onClick={() => setSel(e.key)}>
            <div className="evd">{fmtDate(e.date!)}</div><div className="evt">{e.title}</div>
            <div className="evm"><span className="evn">{e.type}</span><span className={`evp ${done < tot ? "miss" : ""}`}>{done < tot ? `${tot - done} missing` : "✓ All in"}</span></div>
          </div>
        </div>
      );
    });
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    return (
      <div className="tlwrap"><div className="tl" style={{ width: W }}>
        {years.map((y, i) => <div key={y} className={`yband ${i % 2 ? "alt" : ""}`} style={{ left: x(`${y}-01-01`), width: x(`${y + 1}-01-01`) - x(`${y}-01-01`) }}><span>{y}</span></div>)}
        <div className="axis" style={{ top: AX - 1 }} /><div className="today" style={{ left: x(todayIso) }}><span>Today</span></div>{items}
      </div></div>
    );
  }
  const selected = events.find((e) => e.key === sel) ?? events.filter((e) => e.date).slice(-1)[0] ?? null;

  const drawerTarget = drawer ? {
    key: drawer.key, period: null, name: drawer.name, ctx: "Data room", owner: drawer.owner, ownerLabel: ownLabel(drawer.owner),
    explainer: explain.get(docType(drawer.key, drawer.code)) ?? explain.get("generic") ?? null, versions: versionsOf(drawer.key), justUploaded: drawer.justUploaded,
    values: sums.filter((s) => s.req_key === drawer.key && s.period_key === "").map((s) => ({ field: s.field, value: s.value, entered_by_name: s.entered_by_name, entered_at: s.entered_at })),
  } : null;

  if (!answers.incorporatedOn) {
    return <div className="p5"><div className="phold"><b>The data room fills from the company master.</b><br />Answer step 1 — when the company was incorporated — and it starts here.<div style={{ marginTop: 12 }}><Link className="b solid" href="/company-master">Open the company master</Link></div></div></div>;
  }
  return (
    <div className="p5">
      <input ref={fileInput} type="file" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      <div className="content" style={{ padding: "18px 22px" }}>
        {err && <div className="sys warn" style={{ marginLeft: 0 }}>{err}</div>}
        <div className="tabs2">
          {([["std", "Standard documents", null], ["tl", "Company timeline", events.length], ["act", "Activity", log.length]] as const).map(([k, l, c]) => (
            <div key={k} className={`tab2 ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{l}{c !== null && <> <small>{c}</small></>}</div>
          ))}
          <span className="dm" style={{ marginLeft: "auto" }}>{docCount} document{docCount === 1 ? "" : "s"} in the room</span>
        </div>
        <div className="bar">This data room builds itself from the company master. Upload, replace or remove a file here or in the master — both stay in step, and every version is kept.</div>

        {tab === "std" && groups.map((g) => (
          <div key={g.title}>
            <div className="gh"><h3>{g.title}</h3><span className="gsrc">from the company master · step {g.step}</span></div>
            <div className="dgrid">{g.items.map((i) => docCard(i.key, i.name, null, i.owner, null))}</div>
          </div>
        ))}

        {tab === "tl" && (
          <div ref={wrap}>
            <div className="tlkey">{(Object.keys(CAT_NAME) as (keyof typeof CAT_NAME)[]).map((k) => <span key={k}><i style={{ background: CAT_COLOUR[k] }} />{CAT_NAME[k]}</span>)}
              <span className="dm">The ring round each dot fills as documents come in. Add events through the company master.</span></div>
            {timeline()}
            {events.some((e) => !e.date) && <div className="bar">{events.filter((e) => !e.date).map((e) => e.title).join(", ")} — no date given yet. <Link href="/company-master">Add it in the company master</Link>.</div>}
            {selected && (
              <div className="evdetail" style={{ ["--c" as string]: CAT_COLOUR[selected.cat] }}>
                <div className="evhead"><div>
                  <div className="evcat"><i />{CAT_NAME[selected.cat]} · {selected.type}</div><div className="evtitle">{selected.title}</div><div className="dm">{selected.date ? fmtDate(selected.date) : "No date yet"}</div></div>
                  <div className="ring" style={{ ["--c" as string]: CAT_COLOUR[selected.cat], ["--p" as string]: `${selected.docs.length ? (evDone(selected) / selected.docs.length) * 360 : 360}deg` }}><div><b>{evDone(selected)}/{selected.docs.length}</b><span>documents</span></div></div>
                </div>
                <div className="evacts"><Link className="b quiet xs" href="/company-master">Edit details in the master</Link></div>
                {selected.docs.map((d) => docCard(d.key, d.name, d.code ? (data.library.find((l) => l.code === d.code)?.form ?? null) : null, d.owner, d.code, d.key.startsWith("R") && !d.key.includes(":") ? "the standard documents" : undefined))}
              </div>
            )}
          </div>
        )}

        {tab === "act" && (
          <div className="dcard">{log.length ? log.map((l) => (
            <div className="arow" key={l.id}><b>{l.who_name}</b> <span className="dm">{fmtDate(l.at)}{l.step ? ` · step ${l.step}` : ""}</span><div>{l.note}</div>{l.reason && <div className="dm">Why: {l.reason}</div>}</div>
          )) : <div className="dm" style={{ padding: "10px 0" }}>Nothing yet.</div>}
          <div className="dm" style={{ marginTop: 8 }}>Kept permanently. Nothing in the data room is ever deleted — removed files stay in each document&apos;s history.</div></div>
        )}
      </div>
      {modal && <Modal m={modal} onClose={() => setModal(null)} />}
      {drawerTarget && <Drawer t={drawerTarget} me={meName} onClose={() => setDrawer(null)}
        onUpload={(replace) => (replace ? uploadAct(drawerTarget.key, drawerTarget.name, drawerTarget.owner, drawer?.code ?? null) : pickFile(drawerTarget.key, drawerTarget.name, "", drawerTarget.owner, drawer?.code ?? null))}
        onRemove={() => removeAct(drawerTarget.key, drawerTarget.name)}
        onSaved={(vals: SummaryValue[]) => setSums((rows) => [...rows.filter((r) => !(r.req_key === drawerTarget.key && r.period_key === "")), ...vals.map((x) => ({ req_key: drawerTarget.key, period_key: "", field: x.field, value: x.value, entered_by_name: x.entered_by_name, entered_at: x.entered_at }))])} />}
    </div>
  );
}
