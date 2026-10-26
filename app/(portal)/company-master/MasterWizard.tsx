"use client";

import "../proto.css";
import { useMemo, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { safeStorageSegment } from "@/lib/storagePath";
import { unwrap } from "@/lib/actionResult";
import { fmtDate } from "@/lib/dates";
import { buildPlan, booksOwner, type EngineData } from "@/lib/master/engine";
import { clean, maxLen } from "@/lib/idformats";
import { STEP_DEFS, defaultTracking, fieldErrors, isAnswered, rowErrors, lastEndedMonth, stepComplete, trackingOptions, valueAt, visibleQuestions, type Ctx, type Opt, type Q } from "@/lib/master/questions";
import type { Answers, Owner, Plan } from "@/lib/master/types";
import { recordFile, removeFile, saveAnswers, setStepDone } from "./actions";
import Drawer, { type DrawerTarget, type ExplainerFull, type SummaryValue } from "./Drawer";
import { Modal, Own, type ModalState } from "./ui";

export type FileRow = { id: string; req_key: string; period: string | null; version: number; storage_path: string; filename: string; by_name: string | null; at: string; reason: string | null; removed: boolean };
export type LogItem = { id: string; at: string; who_name: string | null; step: number | null; kind: string; note: string; reason: string | null };
export type Explainer = ExplainerFull;
export type SummaryRow = { req_key: string; period_key: string; field: string; value: string | null; entered_by_name: string | null; entered_at: string };

const lockSvg = (<svg className="lockic" viewBox="0 0 16 16"><rect x="3.5" y="7" width="9" height="6.5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M5.5 7V5a2.5 2.5 0 015 0v2" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>);
const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const monthShort = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));
const fk = (key: string, period?: string | null) => `${key}|${period ?? ""}`;
const planKeys = (p: Plan) => new Set<string>([...p.standard.map((s) => s.key), ...p.events.map((e) => e.key), ...p.recurring.map((r) => r.key), ...p.filings.map((f) => f.key)]);

function setPath(a: Answers, path: string, value: unknown): Answers {
  const next = JSON.parse(JSON.stringify(a)) as Record<string, unknown>;
  const keys = path.split(".");
  let o = next;
  keys.slice(0, -1).forEach((k) => { o[k] = (o[k] as Record<string, unknown>) ?? {}; o = o[k] as Record<string, unknown>; });
  o[keys[keys.length - 1]] = value;
  return next as Answers;
}
// Answers that make later answers meaningless clear them, so nothing stale is asked.
function cleanup(a: Answers, id: string, value: unknown): Answers {
  const n = JSON.parse(JSON.stringify(a)) as Answers;
  if (id === "gst" && value === false) n.gst = { registered: false, gstins: [] };
  if (id === "salaries" && value === false) n.salaries = { pays: false };
  if (id === "hasLoans" && value === false) n.loans = [];
  if (id === "hasDebs" && value === false) n.debentures = [];
  if (id === "hasRounds" && value === false) n.rounds = [];
  if (id === "hasHold" && value === false) n.investments = [];
  if (id === "partners" && value === false) n.revenue = { ...n.revenue, sharing: undefined };
  return n;
}
const OPT_LABEL = (o: string | Opt) => (Array.isArray(o) ? o : [o, o]) as [string, string];

// Event document -> the explainer that describes it.
const CODE_EXPLAINER: Record<string, string> = { COI: "coi", PAN: "pan", TAN: "tan", BR: "br", PAS3: "pas3", MGT14: "mgt14", CHG4: "chg4", CHG1: "chg", CHG9: "chg", CHGC: "chg", REDEEM: "red", DCERT: "dcert", TERM: "ts", SSA: "sha", SHA: "sha" };

export default function MasterWizard({ companyId, firmName, initialAnswers, initialDone, data, explainers, files, summaries, log }: {
  companyId: string; firmName: string | null; initialAnswers: Answers; initialDone: number[]; data: EngineData; explainers: Explainer[]; files: FileRow[]; summaries: SummaryRow[]; log: LogItem[];
}) {
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [doneSet, setDoneSet] = useState<number[]>(initialDone.map((n) => n - 1));      // 0-based here, 1-based in the database
  const [fileRows, setFileRows] = useState<FileRow[]>(files);
  const [sums, setSums] = useState<SummaryRow[]>(summaries);
  const firstOpen = Math.min(11, doneSet.length ? Math.max(...doneSet) + 1 : 0);
  const [view, setView] = useState<number | null>(null);        // a finished step being looked at
  const [cur, setCur] = useState<number>(doneSet.includes(11) ? 11 : firstOpen);
  const [edit, setEdit] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [drawer, setDrawer] = useState<{ key: string; period: string | null; name: string; ctx: string } | null>(null);
  const [hist, setHist] = useState<Record<string, boolean>>({});
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [err, setErr] = useState("");
  const [saving, start] = useTransition();
  const [uploading, setUploading] = useState<{ key: string; period: string | null; filename: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pending = useRef<{ key: string; name: string; period: string | null; reason: string } | null>(null);

  const done = (i: number) => doneSet.includes(i);
  const plan = useMemo(() => buildPlan(answers, data), [answers, data]);
  const closer = booksOwner(answers);
  const lib = useMemo(() => new Map(data.library.map((d) => [d.code, { name: d.name, form: d.form }])), [data.library]);
  const ownLabel = (o: Owner) => (o === "founder" ? "Founder" : o === "pba" ? "PBA practitioner" : answers.books?.firmName || firmName || "External practitioner");
  const explain = useMemo(() => new Map(explainers.map((e) => [e.doc_type, e])), [explainers]);
  const ruleOf = useMemo(() => new Map(data.rules.map((r) => [r.rule_id, r])), [data.rules]);

  const byKey = useMemo(() => {
    const m = new Map<string, FileRow[]>();
    for (const f of fileRows) m.set(fk(f.req_key, f.period), [...(m.get(fk(f.req_key, f.period)) ?? []), f]);
    return m;
  }, [fileRows]);
  const versionsOf = (key: string, period?: string | null) => (byKey.get(fk(key, period)) ?? []).slice().sort((a, b) => b.version - a.version);
  const currentOf = (key: string, period?: string | null) => versionsOf(key, period).find((f) => !f.removed);
  const has = (key: string, period?: string | null) => !!currentOf(key, period);
  const ctx: Ctx = { plan, closer, lib };

  function apply(next: Answers) {
    const was = planKeys(plan);
    setFresh(new Set([...planKeys(buildPlan(next, data))].filter((k) => !was.has(k))));
    setAnswers(next);
  }
  function persist(next: Answers, what: string, step: number, why?: string) {
    setErr("");
    start(async () => {
      try { unwrap(await saveAnswers({ answers: next, step: step + 1, what, why })); }
      catch (e) { setErr(e instanceof Error ? e.message : "Could not save"); }
    });
  }
  const stepIndex = view ?? cur;
  const commit = (next: Answers, what: string, why?: string) => { apply(next); persist(next, what, stepIndex, why); };
  const ackQ = (q: Q) => commit(setPath(answers, `ack.${q.id}`, true), `Answered: ${"ask" in q ? q.ask : q.id}`);
  const unack = (id: string, why?: string) => commit(setPath(answers, `ack.${id}`, false), `Reopened an answer`, why);

  /* ---------------- uploads ---------------- */
  function pickFile(key: string, name: string, period: string | null, reason: string) {
    pending.current = { key, name, period, reason };
    setModal(null);
    fileInput.current?.click();
  }
  function uploadAct(key: string, name: string, period: string | null) {
    const up = currentOf(key, period);
    if (up) {
      setModal({ title: `Replace ${name}?`, reason: true, confirm: "Replace file",
        body: <>The current file (version {up.version}, uploaded by {up.by_name ?? "—"}) stays in the history. The new file becomes version {up.version + 1} everywhere it is used — the master and the data room.</>,
        onOk: (r) => pickFile(key, name, period, r) });
    } else pickFile(key, name, period, "");
  }
  function removeAct(key: string, name: string, period: string | null) {
    setModal({ title: `Remove ${name}?`, reason: true, danger: true, confirm: "Remove",
      body: <>It will disappear from the data room and the master will ask for it again. Nothing is deleted — every version stays in the history.</>,
      onOk: (r) => {
        setModal(null);
        start(async () => {
          try {
            unwrap(await removeFile(key, r || "Removed", period));
            setFileRows((rows) => rows.map((f) => (f.req_key === key && (f.period ?? null) === (period ?? null) && !f.removed ? { ...f, removed: true } : f)));
          } catch (e) { setErr(e instanceof Error ? e.message : "Could not remove"); }
        });
      } });
  }
  async function onFile(f: File | undefined) {
    const p = pending.current;
    if (fileInput.current) fileInput.current.value = "";
    if (!f || !p) return;
    setErr("");
    setUploading({ key: p.key, period: p.period, filename: f.name });
    try {
      const path = `${companyId}/master/${safeStorageSegment(p.key)}/${uid()}-${safeStorageSegment(f.name)}`;
      const { error } = await createClient().storage.from("docs").upload(path, f);
      if (error) throw error;
      unwrap(await recordFile({ reqKey: p.key, storagePath: path, filename: f.name, reason: p.reason || undefined, period: p.period }));
      const prev = versionsOf(p.key, p.period)[0];
      setFileRows((rows) => [{ id: uid(), req_key: p.key, period: p.period, version: (prev?.version ?? 0) + 1, storage_path: path, filename: f.name, by_name: "You", at: new Date().toISOString(), reason: p.reason || null, removed: false }, ...rows]);
    } catch (e) { setErr(e instanceof Error ? e.message : "Upload failed"); }
    setUploading(null);
  }
  const later = (key: string) => commit(setPath(answers, `later.${key.replace(/\./g, "_")}`, true), "Marked a document as later");

  /* ---------------- drawer ---------------- */
  function docTypeFor(key: string): string {
    const rule = ruleOf.get(key.split(":")[0]);
    if (rule && rule.section === "event") return CODE_EXPLAINER[key.split(":").pop() ?? ""] ?? "generic";
    return rule?.doc_type ?? "generic";
  }
  function drawerTarget(): DrawerTarget | null {
    if (!drawer) return null;
    const rule = ruleOf.get(drawer.key.split(":")[0]);
    const owner: Owner = rule?.owner_key === "books" ? closer : rule?.owner_key === "pba" ? "pba" : rule && rule.section === "event" ? "founder" : "founder";
    const pk = drawer.period ?? "";
    return {
      key: drawer.key, period: drawer.period, name: drawer.name, ctx: drawer.ctx, explainer: explain.get(docTypeFor(drawer.key)) ?? explain.get("generic") ?? null,
      owner, ownerLabel: ownLabel(owner), versions: versionsOf(drawer.key, drawer.period),
      values: sums.filter((s) => s.req_key === drawer.key && s.period_key === pk).map((s) => ({ field: s.field, value: s.value, entered_by_name: s.entered_by_name, entered_at: s.entered_at })),
    };
  }

  /* ---------------- stage ---------------- */
  const i = stepIndex;
  const { all, out } = i === 11 ? { all: [], out: [] as Q[] } : visibleQuestions(i, answers, ctx, has);
  const complete = i < 11 && stepComplete(i, answers, ctx, has);
  const reviewing = view !== null;
  const remaining = all.length - out.length;

  function answerText(q: Q): string {
    if (q.kind === "choice") { const v = valueAt(answers, q.key); const o = q.opts.find((o) => o[0] === v); return o ? o[1] : String(v); }
    if (q.kind === "date") return fmtDate(String(valueAt(answers, q.key) ?? ""));
    if (q.kind === "multi") return ((valueAt(answers, q.key) as string[]) ?? []).join(", ");
    if (q.kind === "fields") return q.fields.map((f) => String(valueAt(answers, f[0]) ?? "")).filter(Boolean).join(" · ");
    if (q.kind === "rows") return `${((valueAt(answers, q.list) as unknown[]) ?? []).length} added`;
    if (q.kind === "month") return `From ${monthLabel(answers.trackingStart ?? "")}`;
    return "";
  }
  function confirmChange(q: Q) {
    if (done(i)) {
      setModal({ title: "Change a finished step?", reason: true, confirm: "Change it",
        body: <>You&apos;re changing “{"ask" in q ? q.ask : ""}”. What the company is asked for will update from next month, and the data room will follow. The old answer is kept in the history.</>,
        onOk: (r) => { setModal(null); setEdit(q.id); unack(q.id, r); } });
    } else unack(q.id);
  }

  function control(q: Q) {
    if (q.kind === "choice") {
      const v = valueAt(answers, q.key);
      return <div className="opts">{q.opts.map((o) => (
        <button key={String(o[0])} className={`opt ${v === o[0] ? "on" : ""}`} onClick={() => commit(setPath(cleanup(setPath(answers, q.key, o[0]), q.id, o[0]), `ack.${q.id}`, true), `${q.ask} → ${o[1]}`)}>{o[1]}</button>
      ))}</div>;
    }
    if (q.kind === "date") {
      const v = String(valueAt(answers, q.key) ?? "");
      return <div className="next"><input type="date" value={v} max={new Date().toISOString().slice(0, 10)} style={{ border: "1px solid var(--line)", borderRadius: 7, padding: "7px 10px" }}
        onChange={(e) => { let n = setPath(answers, q.key, e.target.value); if (q.id === "inc" && !n.trackingStart) n = setPath(n, "trackingStart", defaultTracking(n)); apply(n); }} />
        <button className="b solid" disabled={!v} onClick={() => ackQ(q)}>Next</button></div>;
    }
    if (q.kind === "month") {
      const opts = trackingOptions(answers);
      return <div className="next"><select style={{ border: "1px solid var(--line)", borderRadius: 7, padding: "7px 10px" }} value={answers.trackingStart ?? ""} onChange={(e) => apply(setPath(answers, "trackingStart", e.target.value))}>
        {opts.map((m) => <option key={m} value={m}>{monthLabel(m)}{m === defaultTracking(answers) ? " — start of this FY" : ""}</option>)}</select>
        <button className="b solid" onClick={() => ackQ(q)}>Next</button></div>;
    }
    if (q.kind === "multi") {
      const v = (valueAt(answers, q.key) as string[] | undefined) ?? [];
      const toggle = (o: string) => {
        let a = v;
        if (o === "None") a = a.includes("None") ? [] : ["None"]; else { a = a.filter((x) => x !== "None"); a = a.includes(o) ? a.filter((x) => x !== o) : [...a, o]; }
        apply(setPath(setPath(answers, q.key, a), `ack.${q.id}`, false));
      };
      return <><div className="opts">{q.opts.map((o) => <button key={o} className={`opt ${v.includes(o) ? "on" : ""}`} onClick={() => toggle(o)}>{o}</button>)}</div>
        <div className="next"><button className="b solid" disabled={!v.length} onClick={() => ackQ(q)}>Next</button></div></>;
    }
    if (q.kind === "fields") {
      const errs = fieldErrors(q.fields, answers);
      return <><div className="fields">{q.fields.map(([path, label, kind, opts, fmt]) => {
        const val = String(valueAt(answers, path) ?? ""); const bad = errs.find((e) => e.path === path);
        return (
        <div className="f" key={path}><label>{label}</label>
          {kind === "select" ? <select value={val} onChange={(e) => apply(setPath(answers, path, e.target.value))}><option value="">Choose…</option>{(opts ?? []).map((o) => <option key={o}>{o}</option>)}</select>
            : <input type={kind === "number" ? "number" : "text"} value={val} min={kind === "number" ? 0 : undefined} step={kind === "number" ? 1 : undefined}
                maxLength={fmt ? maxLen[fmt] : undefined} autoCapitalize={fmt ? "characters" : undefined} spellCheck={fmt ? false : undefined} aria-invalid={bad ? true : undefined}
                style={bad && val ? { borderColor: "#b3261e" } : undefined}
                onChange={(e) => apply(setPath(answers, path, kind === "number" ? (e.target.value === "" ? undefined : Math.max(0, Math.floor(Number(e.target.value)))) : fmt ? clean(fmt, e.target.value) : e.target.value))} />}
          {bad && val && <div className="ferr">{bad.msg}</div>}
        </div>);
      })}</div>
        <div className="next"><button className="b solid" disabled={saving} onClick={() => {
          if (!q.req.every((p) => String(valueAt(answers, p) ?? "").trim())) setErr("Fill in the required details first.");
          else if (errs.length) setErr(errs[0].msg);
          else { setErr(""); ackQ(q); }
        }}>{saving ? "Saving…" : "Next"}</button><span className="help">{q.req.length < q.fields.length ? "Fields marked optional can be left blank." : ""}</span></div></>;
    }
    if (q.kind === "rows") {
      const rows = ((valueAt(answers, q.list) as Record<string, unknown>[] | undefined) ?? []);
      const tpl = q.cols.map((c) => `${c[3]}fr`).join(" ") + " 24px";
      const fmtOf = (k: string) => q.cols.find((c) => c[0] === k)?.[5];
      const setRow = (n: number, k: string, v: string) => { const f = fmtOf(k); apply(setPath(answers, q.list, rows.map((r, j) => (j === n ? { ...r, [k]: f ? clean(f, v) : v } : r)))); };
      return <><div className="rows"><div className="row head" style={{ gridTemplateColumns: tpl }}>{q.cols.map((c) => <span key={c[0]}>{c[1]}</span>)}<span /></div>
        {rows.length === 0 ? <div className="row" style={{ color: "var(--muted)", fontSize: 12.5 }}>Nothing added yet.</div> : rows.map((r, n) => (
          <div className="row" key={String(r.id)} style={{ gridTemplateColumns: tpl }}>
            {q.cols.map(([k, label, kind, , opts]) => kind === "select"
              ? <select key={k} value={String(r[k] ?? "")} onChange={(e) => setRow(n, k, e.target.value)}>{(opts ?? []).map((o) => { const [a, b] = OPT_LABEL(o as string | Opt); return <option key={a} value={a}>{b}</option>; })}</select>
              : <span key={k} style={{ display: "block", minWidth: 0 }}><input type={kind} value={String(r[k] ?? "")} placeholder={label} maxLength={fmtOf(k) ? maxLen[fmtOf(k)!] : undefined} autoCapitalize={fmtOf(k) ? "characters" : undefined} spellCheck={fmtOf(k) ? false : undefined}
                  style={rowErrors(q.cols, r, answers).some((e) => e.key === k) && String(r[k] ?? "") ? { borderColor: "#b3261e" } : undefined} onChange={(e) => setRow(n, k, e.target.value)} />
                  {rowErrors(q.cols, r, answers).filter((e) => e.key === k && String(r[k] ?? "")).map((e) => <span key={e.key} className="ferr">{e.msg}</span>)}</span>)}
            <button className="x" aria-label="Remove" onClick={() => commit(setPath(answers, q.list, rows.filter((_, j) => j !== n)), `Removed a row: ${q.ask}`)}>×</button>
          </div>))}</div>
        <span className="add" role="button" onClick={() => commit(setPath(answers, q.list, [...rows, { id: uid(), ...q.blank }]), `Added a row: ${q.ask}`)}>+ Add another</span>
        <div className="next"><button className="b solid" onClick={() => {
          const bad = rows.map((r) => rowErrors(q.cols, r, answers)[0]).find(Boolean);
          if (!(rows.length && rows.every((r) => q.req.every((k) => String(r[k] ?? "").trim())))) setErr("Complete every line first, or remove the ones you do not need.");
          else if (bad) setErr(bad.msg);
          else { setErr(""); ackQ(q); }
        }}>{saving ? "Saving…" : "Done adding"}</button></div></>;
    }
    return null;
  }

  function uploadBox(key: string, name: string, code: string | null, owner: Owner, period: string | null = null, na?: boolean) {
    if (uploading && uploading.key === key && (uploading.period ?? null) === (period ?? null)) {
      return <div className="drop busy" role="status" aria-live="polite"><div className="dn"><b>{name}</b><div className="dm"><span className="spin" />Uploading {uploading.filename}…</div></div><button className="b solid xs" disabled>Uploading…</button></div>;
    }
    const up = currentOf(key, period);
    const n = versionsOf(key, period).length;
    const open = hist[fk(key, period)];
    const naNow = !!answers.na?.[key.replace(/\./g, "_")];
    const tap = () => setDrawer({ key, period, name, ctx: "Company master" });
    const chip = n ? <button className="cnt-chip" onClick={() => setHist({ ...hist, [fk(key, period)]: !open })}>Uploaded {n} time{n > 1 ? "s" : ""} {open ? "▴" : "▾"}</button> : null;
    const history = open ? (
      <div style={{ flexBasis: "100%" }}><div className="hist">{versionsOf(key, period).map((h) => (
        <div key={h.id} className={`hrow ${currentOf(key, period)?.id === h.id ? "cur" : ""} ${h.removed ? "rem" : ""}`}><span className="hv">{h.removed ? "Removed" : `v${h.version}`}</span>
          <span className="hd">{h.version > 1 ? "Replaced" : "Uploaded"} by {h.by_name} · {fmtDate(h.at)}{h.reason ? ` — “${h.reason}”` : ""} <span className="hf">{h.filename}</span></span>{currentOf(key, period)?.id === h.id && <span className="chip ok">Current</span>}</div>))}</div></div>) : null;
    const title = <div className="dn tap" onClick={tap}><b>{name}</b><span className="ib">i</span>{code && <span className="fc">{code}</span>}</div>;
    if (up) {
      return <div className="drop up" style={{ flexWrap: "wrap" }}><div className="dn tap" onClick={tap}><b>{name}</b><span className="ib">i</span>{code && <span className="fc">{code}</span>}
        <div className="dm">v{up.version} · uploaded by {up.by_name}{up.by_name && owner !== "founder" && false ? "" : ""} · {fmtDate(up.at)} · also in the data room</div></div>
        {chip}<button className="b quiet xs" onClick={() => uploadAct(key, name, period)}>Replace</button><button className="b quiet xs danger-t" onClick={() => removeAct(key, name, period)}>Remove</button>{history}</div>;
    }
    if (naNow) return <div className="drop later"><div className="dn">{title}<div className="dm">Not applicable</div></div><button className="b quiet xs" onClick={() => commit(setPath(answers, `na.${key.replace(/\./g, "_")}`, undefined), `${name}: applicable again`)}>Undo</button></div>;
    if (answers.later?.[key.replace(/\./g, "_")]) {
      return <div className="drop later" style={{ flexWrap: "wrap" }}><div className="dn tap" onClick={tap}><b>{name}</b><span className="ib">i</span>{code && <span className="fc">{code}</span>}<div className="dm">Later — added to {ownLabel(owner)}&apos;s list</div></div>
        {chip}<Own owner={owner} label={ownLabel(owner)} /><button className="b xs" onClick={() => uploadAct(key, name, period)}>Upload now</button>{history}</div>;
    }
    return <div className="drop" style={{ flexWrap: "wrap" }}><div className="dn tap" onClick={tap}><b>{name}</b><span className="ib">i</span>{code && <span className="fc">{code}</span>}
      <div className="dm">{n ? "Removed earlier — upload a new version." : "Drop a file here, or choose one. Anyone on the company can upload."}</div></div>
      {chip}<Own owner={owner} label={ownLabel(owner)} /><button className="b solid xs" onClick={() => uploadAct(key, name, period)}>Upload</button><button className="b quiet xs" onClick={() => later(key)}>Later</button>
      {na && <button className="b quiet xs" onClick={() => commit(setPath(answers, `na.${key.replace(/\./g, "_")}`, "Not applicable"), `${name}: not applicable`)}>Not applicable</button>}{history}</div>;
  }

  function turn(q: Q, last: boolean) {
    if (q.kind === "note") return q.text ? <div className="sys" key={q.id}>ⓘ <div dangerouslySetInnerHTML={{ __html: q.text }} /></div> : null;
    const ok = isAnswered(q, answers, has);
    let body: React.ReactNode;
    if (q.kind === "upload") body = uploadBox(q.key, q.ask.replace(/^Upload (the )?/, "").replace(/^./, (c) => c.toUpperCase()), null, q.owner, q.period ?? null);
    else if (q.kind === "docs") {
      const n = q.docs.filter((d) => has(d.key) || answers.later?.[d.key.replace(/\./g, "_")] || answers.na?.[d.key.replace(/\./g, "_")]).length;
      body = <><div className="help">{n} of {q.docs.length} sorted · becomes a <b>{q.ev}</b> event on the data room timeline</div>
        <div className="doclist">{q.docs.map((d) => <div key={d.key}>{uploadBox(d.key, d.name, d.code, d.owner, null, d.na)}</div>)}</div>
        {n < q.docs.length && <div className="next"><button className="b quiet xs" onClick={() => {
          let a = answers; q.docs.forEach((d) => { if (!has(d.key) && !a.later?.[d.key.replace(/\./g, "_")] && !a.na?.[d.key.replace(/\./g, "_")]) a = setPath(a, `later.${d.key.replace(/\./g, "_")}`, true); }); commit(a, "Marked the rest as later");
        }}>Mark the rest as later</button></div>}</>;
    } else if (ok && edit !== q.id) body = <div className="answered"><span className="achip">{answerText(q)}</span><span className="change" role="button" onClick={() => confirmChange(q)}>Change</span></div>;
    else body = <div className="ans">{control(q)}</div>;
    return (
      <div className={`turn ${last && !ok ? "fresh" : ""}`} key={q.id}><span className="av">PBA</span>
        <div className={`bubble ${ok ? "done" : ""}`}><div className="ask">{q.ask}</div>{q.help && !ok && <div className="help">{q.help}</div>}{body}</div></div>
    );
  }

  /* ---------------- panel ---------------- */
  function panel() {
    type Item = { key: string; name: string; owner: Owner; why?: string };
    const monthly: Item[] = [], quarterly: Item[] = [], once: Item[] = plan.standard.map((s) => ({ key: s.key, name: s.name, owner: s.owner }));
    for (const r of plan.recurring) (r.schedule === "monthly" ? monthly : quarterly).push({ key: r.key, name: r.name, owner: r.owner });
    for (const f of plan.filings) ((f.schedule === "monthly" || f.schedule === "quarter_months_1_2") ? monthly : quarterly).push({ key: f.key, name: `${f.name} (filing)`, owner: f.owner });
    const events = plan.events;
    const ev = events.length;
    const trackFrom = answers.trackingStart;
    const catchN = trackFrom ? Math.max(0, (new Date().getFullYear() - +trackFrom.slice(0, 4)) * 12 + (new Date().getMonth() + 1 - +trackFrom.slice(5))) : 0;
    const grp = (label: string, arr: Item[]) => arr.length ? (<><div className="pg">{label} · {arr.length}</div>{arr.map((x) => <div key={x.key} className={`pi ${fresh.has(x.key) ? "new" : ""}`}><span className="pn" title={x.name}>{x.name}</span><Own owner={x.owner} label={ownLabel(x.owner)} /></div>)}</>) : null;
    const nothing = !monthly.length && !quarterly.length && !once.length && !ev;
    return (
      <div className="panel" id="panel"><div className="ph"><div className="t">What this master generates</div><div className="d">Builds up as you answer.</div>
        <div className="counts"><div className="cnt"><b>{monthly.length}</b><span>monthly</span></div><div className="cnt"><b>{quarterly.length}</b><span>quarterly / yearly</span></div><div className="cnt"><b>{once.length}</b><span>one-time</span></div><div className="cnt"><b>{ev}</b><span>timeline events</span></div></div></div>
        <div className="pl">{nothing && <div className="empty">Nothing yet. Answer the first question to start.</div>}
          {answers.incorporatedOn && catchN > 0 && <><div className="pg">History</div><div className="pi"><span className="pn">Catch-up: {catchN} months, {monthShort(trackFrom!)} – {monthShort(lastEndedMonth())}</span></div></>}
          {grp("Every month", monthly)}{grp("Every quarter / year", quarterly)}{grp("Once", once)}
          {ev > 0 && <><div className="pg">Data room timeline · {ev}</div>{events.map((e) => <div key={e.key} className={`pi ${fresh.has(e.key) ? "new" : ""}`}><span className="pn">{e.kind === "incorp" ? `Incorporation${e.date ? ` · ${fmtDate(e.date)}` : ""}` : e.title}</span></div>)}</>}
        </div></div>
    );
  }

  /* ---------------- review ---------------- */
  function review() {
    const a = answers;
    const entity = ({ private: "Private limited", opc: "One person company", public: "Public limited", llp: "LLP", section8: "Section 8", partnership: "Partnership firm" } as Record<string, string>)[a.entity ?? ""] ?? "—";
    const total = plan.standard.length + plan.events.length + plan.recurring.length + plan.filings.length;
    const laterN = Object.keys(a.later ?? {}).length;
    const finished = done(11);
    return (
      <>
        <div className="sthead"><div><div className="n">Step 12 of 12</div><h2>Review and finish</h2></div></div>
        <div className="turn"><span className="av">PBA</span><div className="bubble"><div className="ask">Here&apos;s what the master will set up for {a.details?.legalName || "the company"}.</div>
          <div className="help">Every answer can be changed later from any finished step. Changes apply from the next month and are recorded with who made them and why.</div></div></div>
        <div className="summary">
          <div><span>Entity</span>{entity}, incorporated {a.incorporatedOn ? fmtDate(a.incorporatedOn) : "—"}</div>
          <div><span>Books</span>{a.books?.software || "—"}, closed by {ownLabel(closer)}</div>
          <div><span>Bank accounts</span>{a.banks?.length ?? 0}</div>
          <div><span>GSTINs</span>{a.gst?.registered ? (a.gst.gstins ?? []).map((g) => g.scheme).join(", ") || "—" : "Not registered"}</div>
          <div><span>People</span>{a.salaries?.pays ? `${a.salaries.employees ?? 0} employees, ${a.salaries.contractors ?? 0} contractors · PF ${a.salaries.pf ? "yes" : "no"} · ESI ${a.salaries.esi ? "yes" : "no"}` : "No salaries"}</div>
          <div><span>Loans · debentures · rounds</span>{a.has?.loans ? a.loans?.length ?? 0 : 0} · {a.has?.debentures ? a.debentures?.length ?? 0 : 0} · {a.has?.rounds ? a.rounds?.length ?? 0 : 0}</div>
          <div><span>Items generated</span>{total}</div>
          <div><span>Documents marked &quot;later&quot;</span>{laterN} — sitting on the owners&apos; lists</div>
        </div>
        <div className="complete"><div><div className="t">{finished ? "Master is live" : "Finish the master"}</div><div className="d">{finished ? "Requests start with the next cycle. Catch-up months are open now." : "The checklist is generated and the first requests go out."}</div></div>
          <div className="acts">{finished ? <span className="achip">Live ✓</span> : <button className="b solid" disabled={saving} onClick={finishStep}>{saving ? <><span className="spin w" />Saving…</> : "Finish and go live"}</button>}</div></div>
      </>
    );
  }

  function finishStep() {
    setErr("");
    start(async () => {
      try {
        unwrap(await setStepDone(i + 1, true));
        setDoneSet((d) => [...new Set([...d, i])]);
      } catch (e) { setErr(e instanceof Error ? e.message : "Could not save"); }
    });
  }
  function proceed() { setView(null); setCur(i + 1); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); }

  const nDone = doneSet.length;
  const dt = drawerTarget();

  return (
    <div className="p5">
      <input ref={fileInput} type="file" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      <div className="prog"><div style={{ width: `${(nDone / 12) * 100}%` }} /></div>
      <div className="layout">
        <div className="steps">{STEP_DEFS.map((s, n) => {
          const st = done(n) ? "done" : n === cur ? "cur" : "locked";
          return (
            <div key={n} className={`step ${st}${view === n ? " view" : ""}`} onClick={() => { if (!done(n) && n !== cur) return; setView(n === cur ? null : n); }}>
              <span className="dot">{done(n) ? "✓" : n + 1}</span>
              <div><div className="sl">{s.t}{st === "locked" && lockSvg}</div><div className="ss">{s.s}</div></div>
            </div>);
        })}</div>

        <div className="stage">
          {err && <div className="sys warn" style={{ marginLeft: 0 }}>{err}</div>}
          {i === 11 ? review() : (
            <>
              {reviewing && <div className="reviewbar">Reviewing a finished step. Changes here update what&apos;s generated from next month.<button className="b xs" onClick={() => setView(null)}>Back to step {cur + 1}</button></div>}
              <div className="sthead"><div><div className="n">Step {i + 1} of 12</div><h2>{STEP_DEFS[i].t}</h2></div><span className="badge">{saving ? <span className="achip"><span className="spin" />Saving…</span> : done(i) ? <span className="achip">Complete ✓</span> : null}</span></div>
              {out.map((q, k) => turn(q, k === out.length - 1))}
              {!complete && remaining > 0 && <div className="locknote" style={{ marginLeft: 42 }}>{remaining} more question{remaining > 1 ? "s" : ""} will appear as you answer.</div>}
              {complete && (
                <div className="complete"><div><div className="t">{done(i) ? `Step ${i + 1} is complete` : `That covers ${STEP_DEFS[i].t.toLowerCase()}`}</div><div className="d">{done(i) ? "Its items are on the right." : "Mark it complete to unlock the next step."}</div></div>
                  <div className="acts">
                    {!done(i) && <button className="b solid" disabled={saving} onClick={finishStep}>{saving ? <><span className="spin w" />Saving…</> : `Complete step ${i + 1}`}</button>}
                    {done(i) && !reviewing && <button className="b solid" onClick={proceed}>Proceed to step {i + 2}: {STEP_DEFS[i + 1].t} →</button>}
                  </div></div>
              )}
            </>
          )}
          <section style={{ marginTop: 28 }}>
            <div className="pg">History</div>
            <div className="hist" style={{ borderTop: 0 }}>
              {log.length === 0 ? <div className="hrow">Nothing recorded yet.</div> : log.slice(0, 10).map((l) => (
                <div className="hrow" key={l.id}><span className="hd">{fmtDate(l.at)} · {l.who_name}{l.step ? ` · step ${l.step}` : ""} · {l.note}{l.reason ? ` — “${l.reason}”` : ""}</span></div>))}
            </div>
          </section>
        </div>

        {panel()}
      </div>
      {modal && <Modal m={modal} onClose={() => setModal(null)} />}
      {dt && <Drawer t={dt} onClose={() => setDrawer(null)}
        onUpload={(replace) => (replace ? uploadAct(dt.key, dt.name, dt.period ?? null) : pickFile(dt.key, dt.name, dt.period ?? null, ""))}
        onRemove={() => removeAct(dt.key, dt.name, dt.period ?? null)}
        onSaved={(vals: SummaryValue[]) => setSums((rows) => [...rows.filter((r) => !(r.req_key === dt.key && r.period_key === (dt.period ?? ""))), ...vals.map((v) => ({ req_key: dt.key, period_key: dt.period ?? "", field: v.field, value: v.value, entered_by_name: v.entered_by_name, entered_at: v.entered_at }))])} />}
    </div>
  );
}
