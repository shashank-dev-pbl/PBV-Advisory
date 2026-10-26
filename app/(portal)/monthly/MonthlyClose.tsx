"use client";

import "../proto.css";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { safeStorageSegment } from "@/lib/storagePath";
import { unwrap } from "@/lib/actionResult";
import { fmtDate } from "@/lib/dates";
import { buildPlan, booksOwner, currentFyStart, type EngineData } from "@/lib/master/engine";
import { DUE_DAY } from "@/lib/master/engine";
import { STATE_COLOUR, STATE_LABEL, canPublish, canSubmit, dueOn, misKey, monthView, tickKey, ymAdd, ymOf, type MonthState } from "@/lib/close/state";
import type { Answers, Owner, Request } from "@/lib/master/types";
import { recordFile, removeFile } from "../company-master/actions";
import Drawer, { type ExplainerFull, type SummaryValue } from "../company-master/Drawer";
import { Modal, type ModalState } from "../company-master/ui";
import type { FileRow, SummaryRow } from "../company-master/MasterWizard";
import { fillWithTestFiles, publishMonth, reopenMonth, setTrackingStart, submitMis, submitMonth, verifyFiling } from "./actions";

export type MonthRow = { period: string; submitted_by: string | null; submitted_by_name: string | null; submitted_at: string | null; published_by_name: string | null; published_at: string | null; reopened: { by: string; at: string; reason: string }[] | null };
export type VerifyRow = { period: string; filing_key: string; verified_by_name: string };

const label = (ym: string, long?: boolean) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-IN", { month: long ? "long" : "short", year: long ? "numeric" : "2-digit" }).replace(/ (\d\d)$/, " ’$1");
const short = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const fk = (key: string, period: string) => `${key}|${period}`;
const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));
const CODE_EXPLAINER: Record<string, string> = {};

type Who = "founder" | "external" | "pba" | "admin";

export default function MonthlyClose({ companyId, meName, initialMonth, devTools, who, meId, firmName, answers, trackingStart, data, explainers, files, summaries, months, verifies }: {
  companyId: string; meName: string; initialMonth?: string; devTools?: boolean; who: Who; meId: string; firmName: string | null; answers: Answers; trackingStart: string | null; data: EngineData;
  explainers: ExplainerFull[]; files: FileRow[]; summaries: SummaryRow[]; months: MonthRow[]; verifies: VerifyRow[];
}) {
  const role = who === "admin" ? "pba" : who;
  const isPBA = role === "pba";
  const canBooks = role !== "founder";                        // books, MIS and filing proof are not the founder's to upload
  const today = useMemo(() => new Date(), []);
  const cur = ymOf(today);
  const plan = useMemo(() => buildPlan(answers, data, today), [answers, data, today]);
  const closer = booksOwner(answers);
  const ownLabel = (o: Owner) => (o === "founder" ? "Founder" : o === "pba" ? "PBA practitioner" : answers.books?.firmName || firmName || "External practitioner");
  const defaultTrack = useMemo(() => { const inc = answers.incorporatedOn?.slice(0, 7); const fy = currentFyStart(today); return inc && inc > fy ? inc : fy; }, [answers.incorporatedOn, today]);
  const [trackFrom, setTrackFrom] = useState(trackingStart ?? answers.trackingStart ?? defaultTrack);

  const [fileRows, setFileRows] = useState<FileRow[]>(files);
  const [sums, setSums] = useState<SummaryRow[]>(summaries);
  const [monthRows, setMonthRows] = useState<MonthRow[]>(months);
  const [verifyRows, setVerifyRows] = useState<VerifyRow[]>(verifies);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [drawer, setDrawer] = useState<{ key: string; period: string; name: string; ctx: string; owner: Owner; justUploaded?: boolean } | null>(null);
  const [hist, setHist] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState("");
  const [saving, start] = useTransition();
  const [uploading, setUploading] = useState<{ key: string; period: string; filename: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pending = useRef<{ key: string; name: string; period: string; reason: string; owner: Owner } | null>(null);
  const capsRef = useRef<HTMLDivElement>(null);

  const byKey = useMemo(() => {
    const m = new Map<string, FileRow[]>();
    for (const f of fileRows) if (f.period) m.set(fk(f.req_key, f.period), [...(m.get(fk(f.req_key, f.period)) ?? []), f]);
    return m;
  }, [fileRows]);
  const versionsOf = (key: string, period: string) => (byKey.get(fk(key, period)) ?? []).slice().sort((a, b) => b.version - a.version);
  const currentOf = (key: string, period: string) => versionsOf(key, period).find((f) => !f.removed);
  const has = (key: string, period: string) => !!currentOf(key, period);
  const monthOf = (ym: string) => monthRows.find((m) => m.period === ym);

  const list = useMemo(() => {
    if (!answers.incorporatedOn) return [] as string[];
    let first = trackFrom;
    for (const f of fileRows) if (f.period && f.period < first && !f.removed) first = f.period;
    const out: string[] = [];
    for (let m = first; m <= ymAdd(cur, 1); m = ymAdd(m, 1)) out.push(m);
    return out;
  }, [trackFrom, fileRows, cur, answers.incorporatedOn]);
  const viewOf = (ym: string) => { const m = monthOf(ym); return monthView({ ym, today, trackFrom, plan, has, submitted: !!m?.submitted_at && !m.published_at, published: !!m?.published_at }); };
  const lastEnded = list.filter((m) => m < cur).slice(-1)[0] ?? list[0];
  const [sel, setSel] = useState<string | null>(initialMonth ?? null);
  const ym = sel && list.includes(sel) ? sel : lastEnded;
  useEffect(() => { capsRef.current?.querySelector(".cap.sel")?.scrollIntoView({ inline: "center", block: "nearest" }); }, [ym]);

  /* ---------- files ---------- */
  function pickFile(key: string, name: string, period: string, reason: string, owner: Owner) { pending.current = { key, name, period, reason, owner }; setModal(null); fileInput.current?.click(); }
  function uploadAct(key: string, name: string, period: string, owner: Owner) {
    const up = currentOf(key, period);
    if (up) setModal({ title: `Replace ${name}?`, reason: true, confirm: "Replace file", body: <>The current file (version {up.version}, uploaded by {up.by_name ?? "—"}) stays in the history. The new file becomes version {up.version + 1}.</>, onOk: (r) => pickFile(key, name, period, r, owner) });
    else pickFile(key, name, period, "", owner);
  }
  function removeAct(key: string, name: string, period: string) {
    setModal({ title: `Remove ${name}?`, reason: true, danger: true, confirm: "Remove", body: <>The month will ask for it again. Nothing is deleted — every version stays in the history.</>,
      onOk: (r) => { setModal(null); start(async () => { try { unwrap(await removeFile(key, r || "Removed", period)); setFileRows((rows) => rows.map((f) => (f.req_key === key && f.period === period && !f.removed ? { ...f, removed: true } : f))); } catch (e) { setErr(e instanceof Error ? e.message : "Could not remove"); } }); } });
  }
  async function onFile(f: File | undefined) {
    const p = pending.current;
    if (fileInput.current) fileInput.current.value = "";
    if (!f || !p) return;
    setErr("");
    setUploading({ key: p.key, period: p.period, filename: f.name });
    try {
      const path = `${companyId}/master/monthly/${p.period}/${safeStorageSegment(p.key)}/${uid()}-${safeStorageSegment(f.name)}`;
      const { error } = await createClient().storage.from("docs").upload(path, f);
      if (error) throw error;
      if (p.key === misKey) unwrap(await submitMis({ period: p.period, storagePath: path, filename: f.name, reason: p.reason || undefined }));   // read and checked first; refused with the reason if a check fails
      else unwrap(await recordFile({ reqKey: p.key, storagePath: path, filename: f.name, reason: p.reason || undefined, period: p.period }));
      const prev = versionsOf(p.key, p.period)[0];
      setFileRows((rows) => [{ id: uid(), req_key: p.key, period: p.period, version: (prev?.version ?? 0) + 1, storage_path: path, filename: f.name, by_name: meName, at: new Date().toISOString(), reason: p.reason || null, removed: false }, ...rows]);
      if (p.key !== misKey) setDrawer({ key: p.key, period: p.period, name: p.name, ctx: `${label(p.period, true)} · monthly close`, owner: p.owner, justUploaded: true });   // the figures are entered while the file is fresh
    } catch (e) { setErr(e instanceof Error ? e.message : "Upload failed"); }
    setUploading(null);
  }

  /* ---------- tracking start ---------- */
  const options = useMemo(() => {
    const inc = answers.incorporatedOn?.slice(0, 7); if (!inc) return [] as string[];
    let s = inc; const min = ymAdd(cur, -24); if (s < min) s = min;
    const out: string[] = []; for (let m = s; m <= cur; m = ymAdd(m, 1)) out.push(m); return out;
  }, [answers.incorporatedOn, cur]);
  function changeTrack(v: string) {
    if (v === trackFrom) return;
    const moving = v > trackFrom ? "later" : "earlier";
    const affected: string[] = []; for (let m = moving === "later" ? trackFrom : v; m < (moving === "later" ? v : trackFrom); m = ymAdd(m, 1)) affected.push(m);
    const withFiles = affected.filter((m) => fileRows.some((f) => f.period === m && !f.removed));
    setModal({ title: `Track from ${label(v, true)}?`, reason: true, confirm: "Change tracking start",
      body: moving === "earlier"
        ? <>{affected.length} more month{affected.length > 1 ? "s" : ""} ({label(affected[0], true)} – {label(affected[affected.length - 1], true)}) will be added. Their documents and filings are requested straight away as catch-up.</>
        : <>{affected.length} month{affected.length > 1 ? "s" : ""} will stop being tracked.{withFiles.length ? ` ${withFiles.length} of them already ${withFiles.length > 1 ? "have" : "has"} files — those months stay visible, greyed out, with every file kept. Moving the start back brings them back.` : " None of them has any files yet."}</>,
      onOk: (r) => { setModal(null); start(async () => { try { unwrap(await setTrackingStart(v, r)); setTrackFrom(v); } catch (e) { setErr(e instanceof Error ? e.message : "Could not change"); } }); } });
  }

  /* ---------- month actions ---------- */
  const stamp = (patch: Partial<MonthRow>, period: string) => setMonthRows((rows) => (rows.some((r) => r.period === period) ? rows.map((r) => (r.period === period ? { ...r, ...patch } : r)) : [...rows, { period, submitted_by: null, submitted_by_name: null, submitted_at: null, published_by_name: null, published_at: null, reopened: null, ...patch }]));
  const run = (fn: () => Promise<unknown>, after: () => void) => start(async () => { setErr(""); try { unwrap(await fn() as never); after(); } catch (e) { setErr(e instanceof Error ? e.message : "Could not do that"); } });
  function doSubmit() {
    setModal({ title: `Submit ${label(ym, true)} for checking?`, confirm: "Submit", body: <>Everything for the month is in. Prime Bottomline checks the figures against last month before anything reaches the dashboard.</>,
      onOk: () => { setModal(null); run(() => submitMonth(ym), () => stamp({ submitted_at: new Date().toISOString(), submitted_by: meId, submitted_by_name: meName, published_at: null }, ym)); } });
  }
  function doPublish() {
    setModal({ title: `Verify and publish ${label(ym, true)}?`, reason: true, confirm: "Verify and publish", body: <>The figures go to the dashboard and the month is marked closed. A published month can be reopened with corrections; earlier versions are kept.</>,
      onOk: (r) => { setModal(null); run(() => publishMonth(ym, r), () => stamp({ published_at: new Date().toISOString(), published_by_name: meName }, ym)); } });
  }
  function doReopen() {
    setModal({ title: `Reopen ${label(ym, true)}?`, reason: true, confirm: "Reopen", body: <>The dashboard keeps showing the published figures until the month is published again. The reopening is recorded.</>,
      onOk: (r) => { setModal(null); run(() => reopenMonth(ym, r), () => stamp({ submitted_at: null, published_at: null, submitted_by: null }, ym)); } });
  }
  const verifiedBy = (period: string, key: string) => verifyRows.find((v) => v.period === period && v.filing_key === key)?.verified_by_name;
  const doVerify = (key: string) => run(() => verifyFiling(ym, key), () => setVerifyRows((v) => [...v, { period: ym, filing_key: key, verified_by_name: meName }]));

  /* ---------- render pieces ---------- */
  const explain = useMemo(() => new Map(explainers.map((e) => [e.doc_type, e])), [explainers]);
  const ruleOf = useMemo(() => new Map(data.rules.map((r) => [r.rule_id, r])), [data.rules]);
  const docTypeFor = (key: string) => (key === misKey ? "mis" : key.startsWith("F:") ? (plan.filings.find((f) => f.key === key.slice(2).replace(/:(paid|filed)$/, ""))?.doc_type ?? "generic") : (ruleOf.get(key.split(":")[0])?.doc_type ?? CODE_EXPLAINER[key] ?? "generic"));

  function docCard(r: { key: string; name: string; owner: Owner }, period: string, mayUpload: boolean) {
    if (uploading && uploading.key === r.key && uploading.period === period) {
      return <div className="dcard" key={r.key} role="status" aria-live="polite"><div className="dct"><div className="dn"><b>{r.name}</b><div className="dm"><span className="spin" />Uploading {uploading.filename}…</div></div><div className="dacts"><button className="b solid xs" disabled>Uploading…</button></div></div></div>;
    }
    const up = currentOf(r.key, period); const n = versionsOf(r.key, period).length; const open = hist[fk(r.key, period)];
    const tap = () => setDrawer({ key: r.key, period, name: r.name, ctx: `${label(period, true)} · monthly close`, owner: r.owner });
    const due = r.key === misKey ? short(dueOn(period, DUE_DAY.books)) : null;
    return (
      <div className={`dcard ${up ? "" : "missing"}`} key={r.key}>
        <div className="dct">
          <div className="dn tap" onClick={tap}><b>{r.name}</b><span className="ib" title="What is this?">i</span>
            <div className="dm">{up ? `v${up.version} · uploaded by ${up.by_name ?? "—"} · ${fmtDate(up.at)}` : `Not uploaded · waiting on ${ownLabel(r.owner)}${due ? ` · due ${due}` : ""}`}{r.key === misKey && !up && <> · <a className="lnk" href="/mis-template-v1.1.xlsx" download>Download template v1.1</a></>}</div></div>
          <div className="dacts">
            {n > 0 && <button className="cnt-chip" onClick={() => setHist({ ...hist, [fk(r.key, period)]: !open })} title="Every version kept">{n} upload{n > 1 ? "s" : ""} {open ? "▴" : "▾"}</button>}
            {mayUpload && (up
              ? <><button className="b quiet xs" onClick={() => uploadAct(r.key, r.name, period, r.owner)}>Replace</button><button className="b quiet xs danger-t" onClick={() => removeAct(r.key, r.name, period)}>Remove</button></>
              : <button className="b solid xs" onClick={() => uploadAct(r.key, r.name, period, r.owner)}>Upload</button>)}
          </div>
        </div>
        {open && <History rows={versionsOf(r.key, period)} />}
      </div>
    );
  }

  function filingRow(f: ReturnType<typeof viewOf>["filings"][number], period: string) {
    const all = f.ticks.every((t) => has(tickKey(f.key, t), period));
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const late = todayIso > f.due && !all; const ver = verifiedBy(period, f.key);
    const proof = (t: string) => (t === "paid" ? ["Tax paid", "Challan"] : f.ticks.length === 1 && f.name.match(/TDS payment|ESI|Professional tax/) ? ["Paid", "Challan"] : ["Filed", f.name.includes("ECR") ? "ECR receipt" : "ARN"]);
    return (
      <div key={f.key}>
        <div className="frow">
          <div className="fname tap" onClick={() => setDrawer({ key: `F:${f.key}`, period, name: f.name, ctx: `${label(period, true)} · filings`, owner: f.owner })}><b>{f.name}</b><span className="ib">i</span>
            <div className={`dm ${late ? "late" : ""}`}>Due {short(f.due)}{late ? " · late" : ""}{ver ? ` · verified by ${ver}` : ""}</div></div>
          <div className="fsides">
            {f.ticks.map((t) => {
              const k = tickKey(f.key, t); const u = currentOf(k, period); const busyTick = uploading?.key === k && uploading.period === period; const [sl, doc] = proof(t); const n = versionsOf(k, period).length;
              return (
                <div key={t} className={`side-b ${u ? "on" : ""}`} title={u ? `${doc} uploaded by ${u.by_name ?? ""}` : `Attach the ${doc.toLowerCase()} to tick this`}
                  onClick={() => { if (u) setHist({ ...hist, [fk(k, period)]: !hist[fk(k, period)] }); else if (canBooks) uploadAct(k, `${f.name} — ${doc}`, period, f.owner); }}>
                  <span className="tk">{busyTick ? <span className="spin" style={{ margin: 0 }} /> : u ? "✓" : ""}</span><div><div className="sl2">{sl}</div><div className="sd">{busyTick ? "Uploading…" : u ? `${doc}${n > 1 ? ` · v${n}` : ""}` : canBooks ? `Attach ${doc.toLowerCase()}` : `${doc} — ${ownLabel(f.owner)}`}</div></div>
                </div>
              );
            })}
            {all && !ver && isPBA && <button className="b quiet xs" onClick={() => doVerify(f.key)}>Verify</button>}
          </div>
        </div>
        {f.ticks.map((t) => { const k = tickKey(f.key, t); return hist[fk(k, period)] ? (
          <div className="fhist" key={k}><History rows={versionsOf(k, period)} />
            {canBooks && currentOf(k, period) && <div style={{ textAlign: "right", marginTop: 4 }}><button className="b quiet xs" onClick={() => uploadAct(k, f.name, period, f.owner)}>Replace</button> <button className="b quiet xs danger-t" onClick={() => removeAct(k, f.name, period)}>Remove</button></div>}</div>) : null; })}
      </div>
    );
  }

  /* ---------- page ---------- */
  if (!answers.incorporatedOn) {
    return <div className="p5"><div className="phold"><b>Monthly close starts from the company master.</b><br />Answer step 1 — when the company was incorporated — and the months appear here.<div style={{ marginTop: 12 }}><a className="b solid" href="/company-master">Open the company master</a></div></div></div>;
  }

  const v = viewOf(ym); const [col] = STATE_COLOUR[v.state]; const row = monthOf(ym);
  const lateN = list.filter((m) => viewOf(m).state === "late").length;
  const misUp = currentOf(misKey, ym);
  const close: [string, string, boolean][] = [
    ["Mandatory documents from the company", `${v.mustIn} of ${v.mustTotal}`, v.mustIn === v.mustTotal],
    ["Books — trial balance, P&L, balance sheet, GST working", v.booksIn ? "In" : "Missing", v.booksIn],
    ["Filings — paid and filed, with proof", `${v.ticksIn} of ${v.ticksTotal} ticks`, v.ticksIn === v.ticksTotal],
    ["MIS workbook uploaded", v.mis ? "Yes" : "No", v.mis],
  ];
  const closerRole = closer === "founder" ? "own" : closer === "pba" ? "pba" : "firm";
  const submitRefusal = canSubmit(role, closerRole, v, ym, today);
  const publishRefusal = canPublish(role, row?.submitted_by ?? null, meId);

  let action: React.ReactNode;
  if (v.state === "published") action = <><span className="achip">Published by {row?.published_by_name} · {row?.published_at ? fmtDate(row.published_at) : ""}</span>{isPBA && <button className="b quiet xs" onClick={doReopen}>Reopen</button>}</>;
  else if (v.state === "submitted") action = isPBA ? (publishRefusal ? <span className="dm">{publishRefusal}</span> : <button className="b solid" disabled={saving} onClick={doPublish}>{saving ? <><span className="spin w" />Saving…</> : "Verify and publish"}</button>) : <span className="dm">Submitted by {row?.submitted_by_name}. Waiting for Prime Bottomline to check and publish.</span>;
  else if (v.state === "untracked") action = <span className="dm">This month is before the tracking start. Its files are kept; move the start back to track it again.</span>;
  else if (ym === cur) action = <span className="dm">The month ends on {short(`${ym}-${String(new Date(+ym.slice(0, 4), +ym.slice(5), 0).getDate()).padStart(2, "0")}`)}. Documents are due by {short(dueOn(ym, DUE_DAY.from_company))}.</span>;
  else action = <><button className="b solid" disabled={!!submitRefusal || saving} onClick={doSubmit}>{saving ? <><span className="spin w" />Saving…</> : "Submit for checking"}</button>{submitRefusal && <span className="dm">{v.ready ? submitRefusal : "Unlocks when everything above is ticked."}</span>}</>;

  const mayDocs = true;                                             // anyone on the company can upload company documents
  const mis: Request = { key: misKey, name: "MIS workbook", owner: closer, section: "books", tier: "mandatory", schedule: "monthly", rule_id: "MIS", doc_type: "mis", period: ym, due: dueOn(ym, DUE_DAY.books) };
  const monthsLateWord = lateN ? `${lateN} month${lateN > 1 ? "s" : ""} late` : "";
  const target = drawer ? {
    key: drawer.key, period: drawer.period, name: drawer.name, ctx: drawer.ctx, owner: drawer.owner, ownerLabel: ownLabel(drawer.owner),
    explainer: explain.get(docTypeFor(drawer.key)) ?? explain.get("generic") ?? null, versions: versionsOf(drawer.key, drawer.period), justUploaded: drawer.justUploaded,
    values: sums.filter((s) => s.req_key === drawer.key && s.period_key === drawer.period).map((s) => ({ field: s.field, value: s.value, entered_by_name: s.entered_by_name, entered_at: s.entered_at })),
  } : null;

  return (
    <div className="p5">
      <input ref={fileInput} type="file" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      <div className="mwrap" style={{ padding: "18px 22px" }}>
        {err && <div className="sys warn" style={{ marginLeft: 0 }}>{err}</div>}
        <div className="trackbar">
          <div><b>Tracking from {label(trackFrom, true)}</b><span className="dm"> · {list.filter((m) => m >= trackFrom && m <= cur).length === 1 ? "1 month" : `${list.filter((m) => m >= trackFrom && m <= cur).length} months`}{trackFrom === defaultTrack ? " · the default, start of this financial year" : ` · changed from the default (${label(defaultTrack, true)})`}</span></div>
          <label className="dm">Change start <select value={trackFrom} onChange={(e) => changeTrack(e.target.value)}>{options.map((m) => <option key={m} value={m}>{label(m, true)}</option>)}</select></label>
        </div>
        <div className="mlegend">
          {(["published", "submitted", "collecting", "late", "open", "untracked"] as MonthState[]).map((k) => <span key={k}><i style={{ background: STATE_COLOUR[k][0] }} />{STATE_LABEL[k]}</span>)}
          {monthsLateWord && <b className="late" style={{ marginLeft: "auto" }}>{monthsLateWord}</b>}
        </div>
        <div className="caps" ref={capsRef}>
          {list.map((m) => {
            const s = viewOf(m); const [c, b] = STATE_COLOUR[s.state]; const p = s.total ? Math.round((s.done / s.total) * 100) : 0;
            return (
              <div key={m} className={`cap ${m === ym ? "sel" : ""} ${s.state}`} style={{ ["--c" as string]: c, ["--b" as string]: b }} onClick={() => setSel(m)}>
                <div className="cm">{label(m)}</div><div className="cs">{STATE_LABEL[s.state]}{s.state === "late" ? ` · ${s.late}` : ""}</div>
                {!["upcoming", "untracked"].includes(s.state) && <div className="cbar"><div style={{ width: `${s.state === "published" ? 100 : p}%` }} /></div>}
              </div>
            );
          })}
        </div>

        {v.state === "upcoming" ? (
          <div className="phold" style={{ margin: "14px 0" }}>{label(ym, true)} hasn&apos;t started. Its requests open on 1 {label(ym, true)}.</div>
        ) : (
          <div className={`mdetail ${v.state === "untracked" ? "faded" : ""}`}>
            <div className="mhead"><div>
              <div className="evcat"><i style={{ background: col }} />{STATE_LABEL[v.state]}</div><div className="evtitle">{label(ym, true)}</div>
              <div className="dm">Company documents due {short(dueOn(ym, DUE_DAY.from_company))} · books and MIS due {short(dueOn(ym, DUE_DAY.books))}</div>
              {(row?.reopened?.length ?? 0) > 0 && <div className="dm">Reopened {row!.reopened!.length} time{row!.reopened!.length > 1 ? "s" : ""} — last reason: “{row!.reopened![row!.reopened!.length - 1].reason}”</div>}</div>
              <div className="ring" style={{ ["--c" as string]: col, ["--p" as string]: `${v.total ? (v.state === "published" ? 360 : (v.done / v.total) * 360) : 0}deg`, background: undefined }}><div><b>{v.state === "published" ? v.total : v.done}/{v.total}</b><span>items</span></div></div>
            </div>
            <div className="mcols">
              <div>
                <div className="gh"><h3>From the company</h3><span className="gsrc">built from the master — bank accounts, GSTINs, payroll, revenue</span></div>
                {v.docs.length ? v.docs.map((d) => docCard(d, ym, mayDocs)) : <div className="dm">Nothing from the company this month.</div>}
                <div className="gh"><h3>Books</h3><span className="gsrc">closed by {ownLabel(closer)}{answers.books?.software ? ` · ${answers.books.software}` : ""}</span></div>
                {v.books.map((d) => docCard(d, ym, canBooks))}
                {docCard(mis, ym, canBooks)}
                {misUp && <div className="dm" style={{ margin: "-4px 0 8px" }}>The figures are read from the workbook when it is checked.</div>}
              </div>
              <div>
                <div className="gh"><h3>Filings</h3><span className="gsrc">tick by attaching the proof</span></div>
                {v.filings.length ? v.filings.map((f) => filingRow(f, ym)) : <div className="dm">No filings for this month.</div>}
                <div className="gh"><h3>Close the month</h3></div>
                <div className="dcard">
                  {close.map(([a, b, ok]) => <div className="ckrow" key={a}><span className={`ck ${ok ? "ok" : ""}`}>{ok ? "✓" : ""}</span><span style={{ flex: 1 }}>{a}</span><span className="dm">{b}</span></div>)}
                  <div className="next" style={{ marginTop: 12, flexWrap: "wrap" }}>{action}</div>
                  <div className="dm" style={{ marginTop: 8 }}>When published, this month&apos;s figures flow to the dashboard.</div>
                  {devTools && isPBA && v.state !== "published" && <div style={{ marginTop: 10 }}><button className="b quiet xs" disabled={saving} onClick={() => run(() => fillWithTestFiles(ym), () => {})}>Dev only: fill with test files</button><span className="dm"> placeholders for everything except the MIS workbook</span></div>}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      {modal && <Modal m={modal} onClose={() => setModal(null)} />}
      {target && <Drawer t={target} me={meName} onClose={() => setDrawer(null)}
        onUpload={(replace) => (replace ? uploadAct(target.key, target.name, target.period!, target.owner) : pickFile(target.key, target.name, target.period!, "", target.owner))}
        onRemove={() => removeAct(target.key, target.name, target.period!)}
        onSaved={(vals: SummaryValue[]) => setSums((rows) => [...rows.filter((r) => !(r.req_key === target.key && r.period_key === target.period)), ...vals.map((x) => ({ req_key: target.key, period_key: target.period!, field: x.field, value: x.value, entered_by_name: x.entered_by_name, entered_at: x.entered_at }))])} />}
    </div>
  );
}

function History({ rows }: { rows: FileRow[] }) {
  if (!rows.length) return <div className="hist"><div className="hrow">No history yet.</div></div>;
  const current = rows.find((r) => !r.removed);
  return (
    <div className="hist">{rows.map((h) => (
      <div key={h.id} className={`hrow ${current?.id === h.id ? "cur" : ""} ${h.removed ? "rem" : ""}`}>
        <span className="hv">{h.removed ? "Removed" : `v${h.version}`}</span>
        <span className="hd">{h.version > 1 ? "Replaced" : "Uploaded"} by {h.by_name} · {fmtDate(h.at)}{h.reason ? ` — “${h.reason}”` : ""} <span className="hf">{h.filename}</span></span>
        {current?.id === h.id && <span className="chip ok">Current</span>}
      </div>))}
    </div>
  );
}
