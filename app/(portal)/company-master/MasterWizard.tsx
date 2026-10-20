"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { safeStorageSegment } from "@/lib/storagePath";
import { getSignedDownloadUrl } from "@/app/founder/actions";
import { unwrap } from "@/lib/actionResult";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { buildPlan, currentFyStart, type EngineData } from "@/lib/master/engine";
import { STEPS, answered, valueAt, visibleQuestions, type Field, type Question, type Step } from "@/lib/master/steps";
import type { Answers, Owner, Plan } from "@/lib/master/types";
import { recordFile, removeFile, saveAnswers, setStepDone } from "./actions";

export type FileRow = { id: string; req_key: string; version: number; storage_path: string; filename: string; by_name: string | null; at: string; reason: string | null; removed: boolean };
export type LogItem = { id: string; at: string; who_name: string | null; step: number | null; kind: string; note: string; reason: string | null };
export type Explainer = { doc_type: string; name: string; what_it_is: string | null; why_it_matters: string | null };

const box = { background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 10 } as const;
const green = { background: "var(--bottomline-green)", color: "var(--paper)", border: "1px solid var(--bottomline-green)" } as const;
const quiet = { background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)" } as const;
const planKeys = (p: Plan) => new Set<string>([...p.standard.map((s) => s.key), ...p.events.map((e) => e.key), ...p.recurring.map((r) => r.key), ...p.filings.map((f) => f.key)]);
const pretty = (v: unknown) => (typeof v === "boolean" ? (v ? "Yes" : "No") : String(v ?? "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()));

function setPath(a: Answers, path: string, value: unknown): Answers {
  const next = JSON.parse(JSON.stringify(a)) as Record<string, unknown>;
  const keys = path.split(".");
  let o = next;
  keys.slice(0, -1).forEach((k) => { o[k] = (o[k] as Record<string, unknown>) ?? {}; o = o[k] as Record<string, unknown>; });
  o[keys[keys.length - 1]] = value;
  return next as Answers;
}
const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
function defaultTracking(a: Answers, today = new Date()): string {
  const fy = currentFyStart(today);
  const inc = a.incorporatedOn?.slice(0, 7);
  return inc && inc > fy ? inc : fy;
}
function catchUpMonths(start: string, today = new Date()): number {
  const [y, m] = start.split("-").map(Number);
  return Math.max(0, (today.getFullYear() - y) * 12 + (today.getMonth() + 1 - m));
}

const FILING_STEP: Record<string, string> = {
  F01: "4 GST", F02: "4 GST", F03: "4 GST", F04: "4 GST", F05: "4 GST", F06: "4 GST", F07: "6 TDS", F08: "6 TDS", F09: "6 TDS", F10: "6 TDS",
  F11: "5 Salaries", F12: "5 Salaries", F13: "5 Salaries", F14: "5 Salaries",
};
const FREQ = { monthly: "every month", quarter_end: "every quarter end", march: "every March", quarter_months_1_2: "months 1 and 2 of each quarter", half_yearly: "September and March" } as Record<string, string>;

export default function MasterWizard({ companyId, firmName, initialAnswers, initialDone, data, explainers, files, log }: {
  companyId: string; firmName: string | null; initialAnswers: Answers; initialDone: number[]; data: EngineData; explainers: Explainer[]; files: FileRow[]; log: LogItem[];
}) {
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [done, setDone] = useState<number[]>(initialDone);
  const [fileRows, setFileRows] = useState<FileRow[]>(files);
  const firstOpen = Math.min(12, (done.length ? Math.max(...done) : 0) + 1);
  const [current, setCurrent] = useState<number>(done.includes(12) ? 12 : firstOpen);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const [fresh, setFresh] = useState<Set<string>>(new Set());   // lines the last answer just added, highlighted in the right panel

  const plan = useMemo(() => buildPlan(answers, data), [answers, data]);
  const explain = useMemo(() => new Map(explainers.map((e) => [e.doc_type, e])), [explainers]);
  const ruleStep = useMemo(() => new Map(data.rules.map((r) => [r.rule_id, r.step])), [data.rules]);
  const step = STEPS[current - 1];
  const isDone = done.includes(current);
  const ownerLabel = (o: Owner) => (o === "founder" ? "Founder" : o === "pba" ? "PBA practitioner" : firmName ?? "External practitioner");

  const byKey = useMemo(() => {
    const m = new Map<string, FileRow[]>();
    for (const f of fileRows) m.set(f.req_key, [...(m.get(f.req_key) ?? []), f]);
    return m;
  }, [fileRows]);
  const currentFile = (key: string) => (byKey.get(key) ?? []).filter((f) => !f.removed).sort((a, b) => b.version - a.version)[0];

  function commit(next: Answers, what: string, why?: string) {
    const before = answers;
    const was = planKeys(plan);
    setFresh(new Set([...planKeys(buildPlan(next, data))].filter((k) => !was.has(k))));
    setAnswers(next);
    setErr("");
    start(async () => {
      try { unwrap(await saveAnswers({ answers: next, step: current, what, why })); }
      catch (e) { setAnswers(before); setErr(e instanceof Error ? e.message : "Could not save"); }
    });
  }
  function finishStep() {
    setErr("");
    start(async () => {
      try {
        unwrap(await setStepDone(current, true));
        setDone((d) => [...new Set([...d, current])]);
        if (current < 12) setCurrent(current + 1);
      } catch (e) { setErr(e instanceof Error ? e.message : "Could not save"); }
    });
  }

  const visible = visibleQuestions(step, answers);
  const firstUnanswered = visible.findIndex((q) => !answered(q, answers));
  const shown = isDone || current === 12 ? visible : firstUnanswered === -1 ? visible : visible.slice(0, firstUnanswered + 1);
  const ready = firstUnanswered === -1;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8">
      <div className="mb-5 h-1.5 w-full overflow-hidden" style={{ background: "var(--rule)", borderRadius: 4 }}>
        <div style={{ width: `${(done.length / 12) * 100}%`, height: "100%", background: "var(--bottomline-green)" }} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[210px_minmax(0,1fr)_340px]">
        <nav className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1" aria-label="Steps">
          {STEPS.map((s) => {
            const d = done.includes(s.n);
            const locked = !d && s.n > firstOpen;
            const on = s.n === current;
            return (
              <button key={s.n} disabled={locked} onClick={() => setCurrent(s.n)} className="flex flex-shrink-0 items-center gap-2.5 px-3 py-2 text-left text-[13.5px]"
                style={{ borderRadius: 7, background: on ? "var(--bottomline-green)" : "transparent", color: on ? "var(--paper)" : locked ? "var(--ink-secondary)" : "var(--ink)", opacity: locked ? 0.55 : 1, fontWeight: on ? 700 : 500 }}>
                <span className="flex h-5 w-5 items-center justify-center text-[11px] font-bold" style={{ borderRadius: "50%", border: `1.5px solid ${on ? "var(--paper)" : "var(--bottomline-green)"}`, background: d && !on ? "var(--bottomline-green)" : "transparent", color: d && !on ? "#fff" : "inherit" }}>
                  {d ? "✓" : s.n}
                </span>
                <span className="whitespace-nowrap">{s.title}</span>
              </button>
            );
          })}
        </nav>

        <section className="min-w-0">
          <h2 className="text-[19px] font-extrabold">{step.n}. {step.title}</h2>
          <p className="mb-4 mt-1 text-[13px]" style={{ color: "var(--ink-secondary)" }}>{step.blurb}</p>
          {isDone && current !== 12 && <p className="mb-3 text-[12px]" style={{ color: "var(--ink-secondary)" }}>This step is done. Anything you change asks why, and is kept in the history. Files already uploaded are never deleted.</p>}
          {err && <p className="mb-3 p-2.5 text-[12.5px]" style={{ background: "#fbe9e7", color: "#8c1a1a", border: "1px solid #e3b8b2" }}>{err}</p>}

          {current === 12 ? (
            <Review answers={answers} plan={plan} done={done} jump={setCurrent} ruleStep={ruleStep} finish={finishStep} finished={done.includes(12)} pending={pending} />
          ) : (
            <div className="grid gap-3.5">
              {shown.map((q) => (
                <QuestionCard key={q.id} q={q} step={step} answers={answers} locked={isDone} commit={commit} plan={plan} explain={explain} ownerLabel={ownerLabel}
                  currentFile={currentFile} versions={(k) => (byKey.get(k) ?? [])} companyId={companyId}
                  onFile={(row) => setFileRows((r) => [row, ...r.map((x) => (x.req_key === row.req_key && !x.removed ? { ...x, removed: true } : x))])}
                  onRemoved={(k) => setFileRows((r) => r.map((x) => (x.req_key === k && !x.removed ? { ...x, removed: true } : x)))}
                  setErr={setErr} />
              ))}
              {!isDone && (
                <div className="flex flex-wrap items-center gap-3">
                  <button className="btn-small" style={{ ...green, opacity: ready ? 1 : 0.5 }} disabled={!ready || pending} onClick={finishStep}>{pending ? "Saving…" : current === 11 ? "Complete, then review" : "Complete"}</button>
                  {!ready && <span className="text-[12px]" style={{ color: "var(--ink-secondary)" }}>Answer the question above to continue.</span>}
                </div>
              )}
              {isDone && current < 12 && <div><button className="btn-small" style={quiet} onClick={() => setCurrent(Math.min(12, firstOpen))}>Go to the next step</button></div>}
            </div>
          )}

          <section className="mt-8">
            <h3 className="mb-2 text-[12px] font-bold uppercase tracking-[0.1em]">History</h3>
            <div className="p-3" style={box}>
              {log.length === 0 ? <p className="text-[12.5px]" style={{ color: "var(--ink-secondary)" }}>Nothing recorded yet.</p> : log.slice(0, 12).map((l) => (
                <p key={l.id} className="py-0.5 text-[12px]"><span style={{ color: "var(--ink-secondary)" }}>{fmtDateTime(l.at)} · {l.who_name}{l.step ? ` · step ${l.step}` : ""} · </span>{l.note}{l.reason ? <i style={{ color: "var(--ink-secondary)" }}> — {l.reason}</i> : null}</p>
              ))}
            </div>
          </section>
        </section>

        <SetsUp plan={plan} ruleStep={ruleStep} fresh={fresh} ownerLabel={ownerLabel} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ the right panel */

function SetsUp({ plan, ruleStep, fresh, ownerLabel }: { plan: Plan; ruleStep: Map<string, string>; fresh: Set<string>; ownerLabel: (o: Owner) => string }) {
  type Line = { key: string; text: string; sub: string };
  const groups = new Map<string, Line[]>();
  const add = (step: string, line: Line) => groups.set(step, [...(groups.get(step) ?? []), line]);
  for (const s of plan.standard) add(ruleStep.get(s.rule_id) ?? "Other", { key: s.key, text: s.name, sub: `once · ${ownerLabel(s.owner)}` });
  for (const e of plan.events) add(ruleStep.get(e.rule_id) ?? "Other", { key: e.key, text: `${e.title} (timeline)`, sub: `${e.docs.length} documents` });
  for (const r of plan.recurring) add(ruleStep.get(r.rule_id) ?? "Other", { key: r.key, text: r.name, sub: `${r.schedule === "monthly" ? "every month" : r.schedule === "quarter_end" ? "every quarter end" : "every March"} · ${ownerLabel(r.owner)}` });
  for (const f of plan.filings) add(FILING_STEP[f.filing_id] ?? "Other", { key: f.key, text: f.name, sub: `${FREQ[f.schedule] ?? f.schedule} · ${f.ticks.length === 2 ? "paid + filed" : f.ticks[0]} · ${ownerLabel(f.owner)}` });
  const ordered = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  const total = plan.standard.length + plan.events.length + plan.recurring.length + plan.filings.length;
  return (
    <aside className="min-w-0 self-start p-4 lg:sticky lg:top-4" style={box} aria-label="What this sets up">
      <h3 className="mb-0.5 text-[13px] font-bold">What this sets up</h3>
      <p className="mb-3 text-[12px]" style={{ color: "var(--ink-secondary)" }}>{total === 0 ? "Nothing yet. Each answer adds what the company is asked for." : `${total} things so far, from your answers.`}</p>
      <div className="max-h-[70vh] overflow-y-auto pr-1">
        {ordered.map(([step, lines]) => (
          <div key={step} className="mb-3">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--ink-secondary)" }}>{step}</p>
            {lines.map((l) => (
              <div key={l.key} className="mb-1 px-2 py-1" style={{ borderRadius: 6, background: fresh.has(l.key) ? "#fdf3dd" : "transparent", border: "1px solid transparent" }}>
                <p className="text-[12.5px] font-semibold leading-snug">{l.text}</p>
                <p className="text-[11px]" style={{ color: "var(--ink-secondary)" }}>{l.sub}</p>
              </div>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------ one question */

type CardProps = {
  q: Question; step: Step; answers: Answers; locked: boolean; commit: (a: Answers, what: string, why?: string) => void; plan: Plan; explain: Map<string, Explainer>;
  ownerLabel: (o: Owner) => string; currentFile: (k: string) => FileRow | undefined; versions: (k: string) => FileRow[]; companyId: string;
  onFile: (row: FileRow) => void; onRemoved: (k: string) => void; setErr: (s: string) => void;
};

function QuestionCard(p: CardProps) {
  const { q, answers, locked } = p;
  const [editing, setEditing] = useState(false);
  const [why, setWhy] = useState("");
  const isFiles = q.type === "upload" || q.type === "docs";
  // On a finished step every answer is read-only until Change, which asks why.
  const readOnly = locked && !editing && !isFiles;
  const commitWithWhy = (a: Answers, what: string) => { p.commit(a, what, locked ? why : undefined); };

  return (
    <div className="p-4" style={box}>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[14px] font-bold">{q.label}</p>
          {q.help && <p className="text-[12px]" style={{ color: "var(--ink-secondary)" }}>{q.help}</p>}
        </div>
        {locked && !isFiles && !editing && <button className="btn-small" style={quiet} onClick={() => setEditing(true)}>Change</button>}
      </div>
      {locked && editing && !isFiles && (
        <div className="mb-3 p-3 text-[12.5px]" style={{ background: "#fdf3dd", border: "1px solid #e3d4a8", color: "#6b5320" }}>
          Changing this updates what the company is asked for. Anything already uploaded is kept.
          <input className="input-field mt-2" placeholder="Why are you changing it? (kept in the history)" value={why} onChange={(e) => setWhy(e.target.value)} />
          <button className="btn-small mt-2" style={quiet} onClick={() => { setEditing(false); setWhy(""); }}>Done</button>
        </div>
      )}
      {readOnly ? <p className="text-[13.5px]">{summarise(q, answers)}</p> : (
        <Body {...p} commit={commitWithWhy} disabled={locked && editing && !why.trim()} />
      )}
    </div>
  );
}

function summarise(q: Question, a: Answers): string {
  const v = "path" in q ? valueAt(a, q.path) : undefined;
  if (q.type === "rows") return (v as unknown[] | undefined)?.length ? `${(v as unknown[]).length} ${q.noun}${(v as unknown[]).length === 1 ? "" : "s"}: ${(v as Record<string, unknown>[]).map((r) => pretty(r[q.columns[0].key])).join(", ")}` : "None";
  if (q.type === "multi") return Array.isArray(v) && v.length ? v.map(pretty).join(", ") : "—";
  if (q.type === "fields") return q.fields.map((f) => `${f.label.split(" (")[0]}: ${pretty((v as Record<string, unknown> | undefined)?.[f.key]) || "—"}`).join(" · ");
  if (q.type === "month") return v ? monthLabel(String(v)) : "—";
  if (q.type === "date") return v ? fmtDate(String(v)) : "—";
  const opt = q.type === "choice" ? q.options.find((o) => o.value === v)?.label : undefined;
  return opt ?? (v === undefined ? "—" : pretty(v));
}

function Body(p: CardProps & { disabled: boolean }) {
  const { q, answers, commit, disabled } = p;
  const val = "path" in q ? valueAt(answers, q.path) : undefined;

  if (q.type === "choice") {
    return (
      <div className="flex flex-wrap gap-2">
        {q.options.map((o) => {
          const on = val === o.value;
          return <button key={String(o.value)} disabled={disabled} className="px-3.5 py-2 text-[13px] font-semibold" style={{ borderRadius: 8, border: `1.5px solid ${on ? "var(--bottomline-green)" : "var(--rule)"}`, background: on ? "var(--bottomline-green)" : "transparent", color: on ? "var(--paper)" : "var(--ink)", opacity: disabled ? 0.5 : 1 }}
            onClick={() => commit(applyChoice(setPath(answers, q.path, o.value), q.id, o.value), `${q.label} → ${o.label}`)}>{o.label}</button>;
        })}
      </div>
    );
  }
  if (q.type === "multi") {
    const arr = (Array.isArray(val) ? val : []) as string[];
    return (
      <div className="flex flex-wrap gap-2">
        {q.options.map((o) => {
          const v = String(o.value);
          const on = arr.includes(v);
          const toggle = () => {
            const isNone = q.none !== undefined && v === q.none;
            const next = isNone ? (on ? [] : [v]) : on ? arr.filter((x) => x !== v) : [...arr.filter((x) => x !== q.none), v];
            // "None" is an answer: stored as an empty list for the engine, with the marker kept for the screen
            commit(setPath(answers, q.path, next), `${q.label} → ${next.length ? next.map(pretty).join(", ") : "none"}`);
          };
          return <button key={v} disabled={disabled} className="px-3 py-1.5 text-[12.5px] font-semibold" style={{ borderRadius: 20, border: `1.5px solid ${on ? "var(--bottomline-green)" : "var(--rule)"}`, background: on ? "var(--bottomline-green)" : "transparent", color: on ? "var(--paper)" : "var(--ink)", opacity: disabled ? 0.5 : 1 }} onClick={toggle}>{o.label}</button>;
        })}
      </div>
    );
  }
  if (q.type === "date" || q.type === "month") {
    return (
      <div>
        <input type={q.type} disabled={disabled} className="input-field" style={{ maxWidth: 260 }} value={String(val ?? "")}
          onChange={(e) => {
            let next = setPath(answers, q.path, e.target.value);
            if (q.id === "incorporatedOn" && e.target.value && !answers.trackingStart) next = setPath(next, "trackingStart", defaultTracking(next));
            commit(next, `${q.label} → ${e.target.value}`);
          }} />
        {q.id === "trackingStart" && typeof val === "string" && val && <p className="mt-1.5 text-[12px]" style={{ color: "var(--ink-secondary)" }}>{catchUpMonths(val) === 0 ? "No catch-up months." : `${catchUpMonths(val)} catch-up month${catchUpMonths(val) === 1 ? "" : "s"}: their documents and filings are asked for at once.`}</p>}
      </div>
    );
  }
  if (q.type === "fields") return <FieldsForm q={q} answers={answers} commit={commit} disabled={disabled} />;
  if (q.type === "rows") return <RowsForm q={q} answers={answers} commit={commit} disabled={disabled} />;
  if (q.type === "upload") {
    const items = p.plan.standard.filter((s) => q.rules.includes(s.rule_id));
    if (items.length === 0) return <p className="text-[12.5px]" style={{ color: "var(--ink-secondary)" }}>Nothing to upload for this answer.</p>;
    return <div className="grid gap-2.5">{items.map((s) => <Slot key={s.key} {...p} reqKey={s.key} name={s.name} owner={p.ownerLabel(s.owner)} why={p.explain.get(s.doc_type ?? "")?.why_it_matters ?? p.explain.get(s.doc_type ?? "")?.what_it_is ?? null} />)}</div>;
  }
  // docs: one block per timeline event
  const events = p.plan.events.filter((e) => q.rules.includes(e.rule_id));
  if (events.length === 0) return <p className="text-[12.5px]" style={{ color: "var(--ink-secondary)" }}>Nothing yet. Add the rows above and the documents appear here.</p>;
  return (
    <div className="grid gap-4">
      {events.map((e) => (
        <div key={e.key}>
          <p className="mb-1.5 text-[13px] font-bold">{e.title}{e.date ? ` · ${fmtDate(e.date)}` : ""} <span className="font-normal" style={{ color: "var(--ink-secondary)" }}>· {e.docs.filter((d) => !d.sharedWith).length} to upload</span></p>
          <div className="grid gap-2">
            {e.docs.map((d) => d.sharedWith
              ? <div key={d.name} className="px-3 py-2 text-[12.5px]" style={{ border: "1px dashed var(--rule)", borderRadius: 8, color: "var(--ink-secondary)" }}>{d.name} — the same record as in the standard documents. Uploaded once.</div>
              : <Slot key={`${e.key}:${d.code ?? d.name}`} {...p} reqKey={`${e.key}:${d.code ?? d.name}`} name={d.name} owner={p.ownerLabel("founder")} why={null} allowNa />)}
          </div>
        </div>
      ))}
    </div>
  );
}

// "Is registered for GST" answered No clears the GSTINs; "None" clears dependent answers so nothing stale is asked.
function applyChoice(a: Answers, id: string, value: string | boolean): Answers {
  const next = JSON.parse(JSON.stringify(a)) as Answers;
  if (id === "gstReg" && value === false) next.gst = { registered: false, gstins: [] };
  if (id === "pays" && value === false) next.salaries = { pays: false };
  if (id === "hasLoans" && value === false) next.loans = [];
  if (id === "hasDeb" && value === false) next.debentures = [];
  if (id === "hasRounds" && value === false) next.rounds = [];
  if (id === "hasInv" && value === false) next.investments = [];
  if (id === "partners" && value === false) next.revenue = { ...next.revenue, sharing: undefined };
  return next;
}

/* ------------------------------------------------------------ forms */

function Input({ f, value, onChange, disabled }: { f: Field; value: unknown; onChange: (v: unknown) => void; disabled: boolean }) {
  const cls = "input-field";
  if (f.kind === "select") return <select disabled={disabled} className={cls} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}><option value="">Choose…</option>{(f.options ?? []).map((o) => <option key={o} value={o}>{pretty(o)}</option>)}</select>;
  if (f.kind === "yesno") return <select disabled={disabled} className={cls} value={value === undefined ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value === "true")}><option value="">Choose…</option><option value="true">Yes</option><option value="false">No</option></select>;
  return <input disabled={disabled} className={cls} type={f.kind === "number" ? "number" : f.kind === "date" ? "date" : "text"} placeholder={f.placeholder} value={String(value ?? "")}
    onChange={(e) => onChange(f.kind === "number" ? (e.target.value === "" ? undefined : Number(e.target.value)) : e.target.value)} />;
}

function FieldsForm({ q, answers, commit, disabled }: { q: Extract<Question, { type: "fields" }>; answers: Answers; commit: CardProps["commit"]; disabled: boolean }) {
  const base = ((valueAt(answers, q.path) ?? {}) as Record<string, unknown>);
  const [draft, setDraft] = useState<Record<string, unknown>>(base);
  const dirty = JSON.stringify(draft) !== JSON.stringify(base);
  return (
    <div>
      <div className="grid gap-3 md:grid-cols-2">
        {q.fields.map((f) => <label key={f.key} className="text-[12px] font-semibold">{f.label}{f.required ? " *" : ""}<div className="mt-1"><Input f={f} value={draft[f.key]} disabled={disabled} onChange={(v) => setDraft({ ...draft, [f.key]: v })} /></div></label>)}
      </div>
      <button className="btn-small mt-3" style={green} disabled={disabled || !dirty} onClick={() => commit(setPath(answers, q.path, { ...base, ...draft }), `Saved ${q.label.toLowerCase()}`)}>Save</button>
    </div>
  );
}

function RowsForm({ q, answers, commit, disabled }: { q: Extract<Question, { type: "rows" }>; answers: Answers; commit: CardProps["commit"]; disabled: boolean }) {
  const rows = (Array.isArray(valueAt(answers, q.path)) ? valueAt(answers, q.path) : []) as Record<string, unknown>[];
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const missing = q.columns.some((c) => c.required && (draft[c.key] === undefined || draft[c.key] === ""));
  return (
    <div>
      {rows.length > 0 && (
        <div className="mb-3 overflow-x-auto">
          <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
            <thead><tr>{q.columns.map((c) => <th key={c.key} className="px-2 py-1.5 text-left text-[11px] font-semibold uppercase" style={{ color: "var(--ink-secondary)" }}>{c.label}</th>)}<th /></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={String(r.id)} style={{ borderTop: "1px solid var(--rule)" }}>
                  {q.columns.map((c) => <td key={c.key} className="px-2 py-1.5">{pretty(r[c.key]) || "—"}</td>)}
                  <td className="px-2 py-1.5 text-right"><button disabled={disabled} className="btn-small" style={quiet} onClick={() => commit(setPath(answers, q.path, rows.filter((_, j) => j !== i)), `Removed ${q.noun} ${pretty(r[q.columns[0].key])}`)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="grid items-end gap-3 md:grid-cols-3">
        {q.columns.map((c) => <label key={c.key} className="text-[12px] font-semibold">{c.label}{c.required ? " *" : ""}<div className="mt-1"><Input f={c} value={draft[c.key]} disabled={disabled} onChange={(v) => setDraft({ ...draft, [c.key]: v })} /></div></label>)}
      </div>
      <button className="btn-small mt-3" style={green} disabled={disabled || missing}
        onClick={() => { commit(setPath(answers, q.path, [...rows, { id: uid(), ...draft }]), `Added ${q.noun} ${pretty(draft[q.columns[0].key])}`); setDraft({}); }}>Add {q.noun}</button>
    </div>
  );
}

/* ------------------------------------------------------------ one file slot */

function Slot(p: CardProps & { reqKey: string; name: string; owner: string; why: string | null; allowNa?: boolean }) {
  const { reqKey, answers } = p;
  const file = p.currentFile(reqKey);
  const na = answers.na?.[reqKey];
  const [asking, setAsking] = useState<"replace" | "remove" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function upload(f: File | undefined) {
    if (!f) return;
    setBusy(true); p.setErr("");
    try {
      const path = `${p.companyId}/master/${safeStorageSegment(reqKey)}/${Date.now()}-${safeStorageSegment(f.name)}`;
      const { error } = await createClient().storage.from("docs").upload(path, f);
      if (error) throw error;
      unwrap(await recordFile({ reqKey, storagePath: path, filename: f.name, reason: asking === "replace" ? reason : undefined }));
      p.onFile({ id: uid(), req_key: reqKey, version: (p.versions(reqKey)[0]?.version ?? 0) + 1, storage_path: path, filename: f.name, by_name: "You", at: new Date().toISOString(), reason: reason || null, removed: false });
      setAsking(null); setReason("");
    } catch (e) { p.setErr(e instanceof Error ? e.message : "Upload failed"); }
    setBusy(false);
    if (input.current) input.current.value = "";
  }
  async function remove() {
    setBusy(true); p.setErr("");
    try { unwrap(await removeFile(reqKey, reason)); p.onRemoved(reqKey); setAsking(null); setReason(""); }
    catch (e) { p.setErr(e instanceof Error ? e.message : "Could not remove"); }
    setBusy(false);
  }

  return (
    <div className="p-3" style={{ border: "1px solid var(--rule)", borderRadius: 8, background: "var(--paper)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">{p.name}</p>
          <p className="text-[11.5px]" style={{ color: "var(--ink-secondary)" }}>Owner: {p.owner}{p.why ? ` · ${p.why}` : ""}</p>
        </div>
        <input ref={input} type="file" hidden onChange={(e) => upload(e.target.files?.[0])} />
        {file ? (
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-small" style={quiet} onClick={async () => window.open(await getSignedDownloadUrl(file.storage_path), "_blank")}>{file.filename}</button>
            <button className="btn-small" style={quiet} onClick={() => setAsking(asking === "replace" ? null : "replace")}>Replace</button>
            <button className="btn-small" style={quiet} onClick={() => setAsking(asking === "remove" ? null : "remove")}>Remove</button>
          </div>
        ) : na ? (
          <span className="text-[12px]" style={{ color: "var(--ink-secondary)" }}>Not applicable <button className="ml-2 underline" onClick={() => p.commit(setPath(answers, `na.${reqKey.replace(/\./g, "_")}`, undefined), `${p.name}: applicable again`)}>Undo</button></span>
        ) : (
          <div className="flex gap-2">
            <button className="btn-small" style={green} disabled={busy} onClick={() => input.current?.click()}>{busy ? "Uploading…" : "Upload"}</button>
            <span className="self-center text-[12px]" style={{ color: "var(--ink-secondary)" }}>or later</span>
            {p.allowNa && <button className="btn-small" style={quiet} onClick={() => p.commit(setPath(answers, `na.${reqKey.replace(/\./g, "_")}`, "Not applicable"), `${p.name}: not applicable`)}>Not applicable</button>}
          </div>
        )}
      </div>
      {file && <p className="mt-1 text-[11.5px]" style={{ color: "var(--ink-secondary)" }}>v{file.version} · {file.by_name} · {fmtDate(file.at)}{p.versions(reqKey).length > 1 ? ` · ${p.versions(reqKey).length} versions kept` : ""}</p>}
      {asking && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input className="input-field" style={{ maxWidth: 340 }} placeholder={asking === "replace" ? "Why are you replacing it?" : "Why are you removing it?"} value={reason} onChange={(e) => setReason(e.target.value)} />
          {asking === "replace"
            ? <button className="btn-small" style={green} disabled={!reason.trim() || busy} onClick={() => input.current?.click()}>Choose the new file</button>
            : <button className="btn-small" style={{ background: "#8c1a1a", color: "#fff", border: "1px solid #8c1a1a" }} disabled={!reason.trim() || busy} onClick={remove}>Remove</button>}
          <span className="text-[11.5px]" style={{ color: "var(--ink-secondary)" }}>The old version is kept.</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ review */

function Review({ answers, plan, done, jump, ruleStep, finish, finished, pending }: { answers: Answers; plan: Plan; done: number[]; jump: (n: number) => void; ruleStep: Map<string, string>; finish: () => void; finished: boolean; pending: boolean }) {
  const standard = plan.standard.length, events = plan.events.length;
  const monthly = plan.recurring.filter((r) => r.schedule === "monthly").length, quarterly = plan.recurring.filter((r) => r.schedule !== "monthly").length;
  const filings = plan.filings.length;
  void ruleStep;
  return (
    <div className="grid gap-3.5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["One-time documents", standard], ["Timeline events", events], ["Monthly requests", monthly], ["Filings", filings]].map(([l, n]) => (
          <div key={String(l)} className="p-3.5" style={box}><p className="text-[12px]" style={{ color: "var(--ink-secondary)" }}>{l}</p><p className="tnum text-[24px] font-bold">{n}</p></div>
        ))}
      </div>
      <p className="text-[12px]" style={{ color: "var(--ink-secondary)" }}>Plus {quarterly} more that appear only at a quarter end or in March.</p>
      {STEPS.slice(0, 11).map((s) => (
        <div key={s.n} className="p-4" style={box}>
          <div className="mb-1.5 flex items-center justify-between gap-2"><p className="text-[13.5px] font-bold">{s.n}. {s.title}{done.includes(s.n) ? "" : " · not done yet"}</p><button className="btn-small" style={quiet} onClick={() => jump(s.n)}>Change</button></div>
          {visibleQuestions(s, answers).filter((q) => q.type !== "upload" && q.type !== "docs").map((q) => <p key={q.id} className="py-0.5 text-[12.5px]"><span style={{ color: "var(--ink-secondary)" }}>{q.label} </span>{answered(q, answers) ? summarise(q, answers) : <i>not answered</i>}</p>)}
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button className="btn-small" style={green} disabled={pending || finished} onClick={finish}>{finished ? "Master complete" : pending ? "Saving…" : "Finish"}</button>
        {finished && <span className="text-[12.5px]" style={{ color: "#004d00" }}>The master is complete. Change any answer above whenever something changes.</span>}
      </div>
    </div>
  );
}
