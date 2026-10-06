"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { safeStorageSegment } from "@/lib/storagePath";
import { getSignedDownloadUrl } from "@/app/founder/actions";
import { addEventDocument, createEvent, markEventDocNotApplicable, uploadStandardDocument } from "./actions";
import {
  CATEGORY_COLOUR, docState, eventStats, fmtDate,
  type EventDocRow, type EventRow, type EventType, type EventTypeDoc, type LibDoc, type StdDocRow, type StdKind,
} from "@/lib/dataroom";

type Props = {
  companyId: string;
  canEdit: boolean;
  lib: LibDoc[];
  eventTypes: EventType[];
  typeDocs: EventTypeDoc[];
  kinds: StdKind[];
  stdDocs: StdDocRow[];
  events: EventRow[];
  eventDocs: EventDocRow[];
};

const box = { background: "var(--card, #fff)", border: "1px solid var(--rule)", borderRadius: 10 } as const;
const btn = "text-[12px] font-semibold px-2.5 py-1.5 border";
const btnStyle = { borderColor: "var(--rule)", background: "#fff", borderRadius: 6 } as const;

async function download(path: string) {
  window.open(await getSignedDownloadUrl(path), "_blank");
}

async function putFile(companyId: string, file: File) {
  const path = `${companyId}/dataroom/${Date.now()}-${safeStorageSegment(file.name)}`;
  const { error } = await createClient().storage.from("docs").upload(path, file);
  if (error) throw error;
  return path;
}

export default function DataRoom(p: Props) {
  const [tab, setTab] = useState<"standard" | "timeline">("standard");
  return (
    <>
      <div className="mb-5 flex gap-1 border-b" style={{ borderColor: "var(--rule)" }}>
        {([["standard", "Standard documents"], ["timeline", `Company timeline · ${p.events.length} events`]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className="px-3.5 py-2.5 text-[13.5px]"
            style={{ borderBottom: `2px solid ${tab === k ? "var(--bottomline-green)" : "transparent"}`, color: tab === k ? "var(--bottomline-green)" : "var(--ink-secondary)", fontWeight: tab === k ? 700 : 500, marginBottom: -1 }}>
            {l}
          </button>
        ))}
      </div>
      {!p.canEdit && (
        <div className="mb-5 p-3.5 text-[13px]" style={{ background: "#eef3ec", border: "1px solid #cfdccd", color: "#22452a" }}>
          Everything about the company&apos;s legal history in one place. Your practitioners keep it up to date; you can view and download anything.
        </div>
      )}
      {tab === "standard" ? <Standard {...p} /> : <Timeline {...p} />}
    </>
  );
}

/* ---------------- Standard documents ---------------- */

function Standard({ companyId, canEdit, kinds, stdDocs }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const target = useRef("");

  const byKind = useMemo(() => {
    const m: Record<string, StdDocRow[]> = {};
    for (const d of stdDocs) (m[d.kind] ??= []).push(d);
    for (const k of Object.keys(m)) m[k].sort((a, b) => b.version - a.version);
    return m;
  }, [stdDocs]);

  const groups = useMemo(() => {
    const g: Record<string, StdKind[]> = {};
    for (const k of [...kinds].sort((a, b) => a.sort - b.sort)) {
      if (q && !k.label.toLowerCase().includes(q.toLowerCase())) continue;
      (g[k.grp] ??= []).push(k);
    }
    return Object.entries(g);
  }, [kinds, q]);

  function pick(kind: string) {
    target.current = kind;
    fileRef.current?.click();
  }
  async function onFile(f: File | undefined) {
    if (!f) return;
    const kind = target.current;
    setBusy(kind); setErr("");
    try {
      const path = await putFile(companyId, f);
      start(async () => { try { await uploadStandardDocument(kind, path, f.name); } catch (e) { setErr((e as Error).message); } setBusy(""); });
    } catch (e) { setErr((e as Error).message); setBusy(""); }
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div>
      <input ref={fileRef} type="file" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <input className="input-field" style={{ maxWidth: 280 }} placeholder="Search documents" value={q} onChange={(e) => setQ(e.target.value)} />
        <a href="/dataroom/zip" className={btn} style={btnStyle}>Download all as ZIP</a>
      </div>
      <p className="mb-3 text-[12px]" style={{ color: "var(--ink-secondary)" }}>
        The current version of each document. When an event changes one — an altered AOA after a round — it updates here and the older version is kept.
      </p>
      {err && <p className="mb-3 text-[12px]" style={{ color: "#8c1a1a" }}>{err}</p>}
      {groups.length === 0 && <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>Nothing matches that search.</p>}
      {groups.map(([grp, ks]) => (
        <section key={grp} className="mb-6">
          <h2 className="mb-2 text-[13px] font-bold">{grp}</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {ks.map((k) => {
              const versions = byKind[k.code] ?? [];
              const cur = versions[0];
              return (
                <div key={k.code} className="min-w-0 p-3" style={box}>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold">{k.label}</div>
                      <div className="text-[11.5px]" style={{ color: "var(--ink-secondary)" }}>
                        {cur ? <>Updated {fmtDate(cur.at.slice(0, 10))} · v{cur.version} · from <b style={{ color: "var(--bottomline-green)" }}>{cur.source}</b></> : "Not uploaded yet"}
                      </div>
                    </div>
                    {cur && <button className={btn} style={btnStyle} onClick={() => download(cur.storage_path)}>Download</button>}
                    {canEdit && <button className={btn} style={btnStyle} disabled={busy === k.code} onClick={() => pick(k.code)}>{busy === k.code ? "Uploading…" : cur ? "New version" : "Upload"}</button>}
                  </div>
                  {versions.length > 1 && (
                    <div className="mt-2">
                      <button className="text-[11.5px] font-semibold" style={{ color: "var(--ink-secondary)" }} onClick={() => setOpen(open === k.code ? null : k.code)}>
                        {open === k.code ? "Hide" : "Show"} earlier versions ({versions.length - 1})
                      </button>
                      {open === k.code && versions.slice(1).map((v) => (
                        <div key={v.id} className="mt-1 flex items-center justify-between gap-2 text-[11.5px]">
                          <span>v{v.version} · {fmtDate(v.at.slice(0, 10))} · {v.source}</span>
                          <button className="font-semibold underline" onClick={() => download(v.storage_path)}>Download</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ---------------- Timeline ---------------- */

const START = new Date("2021-01-01").getTime();
const END = new Date("2027-01-01").getTime();
const W = 1180;
const LANES = [100, 214, 20, 300]; // card tops: near-above, near-below, far-above, far-below (axis at 189)
const xOf = (d: string) => 30 + (W - 60) * ((new Date(d + "T00:00").getTime() - START) / (END - START));

function Timeline(p: Props) {
  const { events, eventDocs, eventTypes, typeDocs } = p;
  const [sel, setSel] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [off, setOff] = useState<Record<string, boolean>>({});
  const typeBy = useMemo(() => Object.fromEntries(eventTypes.map((t) => [t.code, t])), [eventTypes]);

  const expectedFor = (type: string) => typeDocs.filter((d) => d.event_type === type && d.need === "expected").map((d) => d.doc_code);
  const docsOf = (id: string) => eventDocs.filter((d) => d.event_id === id);
  const sorted = useMemo(() => [...events].sort((a, b) => a.event_date.localeCompare(b.event_date)), [events]);
  const shown = sorted.filter((e) => !off[typeBy[e.type]?.category]);
  const selected = events.find((e) => e.id === sel) ?? null;
  const todayX = xOf(new Date().toISOString().slice(0, 10));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(CATEGORY_COLOUR).map(([k, c]) => (
            <button key={k} onClick={() => setOff({ ...off, [k]: !off[k] })} className="inline-flex items-center gap-1.5 border px-2.5 py-1 text-[12px]"
              style={{ borderColor: "var(--rule)", borderRadius: 20, background: "#fff", opacity: off[k] ? 0.45 : 1, textDecoration: off[k] ? "line-through" : "none" }}>
              <i style={{ width: 9, height: 9, borderRadius: "50%", background: c }} />{k}
            </button>
          ))}
        </div>
        {p.canEdit && <button className={btn} style={{ ...btnStyle, background: "var(--bottomline-green)", color: "#fff", borderColor: "var(--bottomline-green)" }} onClick={() => { setAdding(true); setSel(null); }}>+ Add event</button>}
      </div>
      <p className="mb-2 text-[12px]" style={{ color: "var(--ink-secondary)" }}>
        The ring around each dot fills as its documents arrive. <b style={{ color: "#a0301f" }}>Red</b> means documents are missing.
      </p>

      <div className="overflow-x-auto" style={box}>
        <div style={{ position: "relative", width: W, height: 384 }}>
          {[2021, 2022, 2023, 2024, 2025, 2026].map((y, i) => (
            <div key={y} style={{ position: "absolute", top: 0, bottom: 0, left: xOf(`${y}-01-01`), width: xOf(`${y + 1}-01-01`) - xOf(`${y}-01-01`), borderLeft: "1px dashed #e6e0d1", background: i % 2 ? "#fbf8f1" : "transparent" }}>
              <span style={{ position: "absolute", bottom: 6, left: 8, fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: "#b9b3a3" }}>{y}</span>
            </div>
          ))}
          <div style={{ position: "absolute", left: 20, right: 20, top: 189, height: 3, background: "#d9d2c0", borderRadius: 2 }} />
          <div style={{ position: "absolute", top: 10, bottom: 24, left: todayX, borderLeft: "2px dashed #b4531a", opacity: 0.6 }}>
            <span style={{ position: "absolute", top: -2, left: 5, fontSize: 10.5, color: "#b4531a", fontWeight: 600 }}>Today</span>
          </div>
          {shown.map((e, i) => {
            const t = typeBy[e.type]; const c = CATEGORY_COLOUR[t?.category] ?? "#888";
            const exp = expectedFor(e.type); const st = eventStats(exp, docsOf(e.id));
            const pct = st.total ? Math.round((st.done / st.total) * 100) : 100;
            const x = xOf(e.event_date); const top = LANES[i % 4]; const above = top < 189;
            const left = Math.max(2, Math.min(W - 152, x - 75));
            const on = sel === e.id;
            return (
              <div key={e.id}>
                <div style={{ position: "absolute", left: x, width: 2, marginLeft: -1, background: c, opacity: 0.55, top: above ? top + 74 : 190, height: above ? 189 - (top + 74) : top - 190 }} />
                <div onClick={() => { setSel(e.id); setAdding(false); }} title={e.title}
                  style={{ position: "absolute", left: x, top: 190, width: 24, height: 24, margin: "-12px 0 0 -12px", borderRadius: "50%", cursor: "pointer", zIndex: 3, display: "grid", placeItems: "center", transform: on ? "scale(1.25)" : undefined,
                    background: `conic-gradient(${c} ${pct}%, #e6e0d1 0)` }}>
                  <span style={{ width: 14, height: 14, borderRadius: "50%", background: on ? c : "#fffdf8", boxShadow: `inset 0 0 0 4px ${c}` }} />
                </div>
                <div onClick={() => { setSel(e.id); setAdding(false); }}
                  style={{ position: "absolute", left, top, width: 150, height: 74, background: "#fff", border: "1px solid var(--rule)", borderTop: `3px solid ${c}`, borderRadius: 9, padding: "7px 10px", cursor: "pointer", zIndex: 2, overflow: "hidden", boxShadow: on ? `0 0 0 2px ${c}` : undefined }}>
                  <div style={{ fontSize: 10.5, color: "var(--ink-secondary)" }}>{fmtDate(e.event_date)}</div>
                  <div className="truncate" style={{ fontSize: 12.5, fontWeight: 650, marginTop: 1 }}>{e.title}</div>
                  <div style={{ fontSize: 10.5, marginTop: 5, fontWeight: 600, color: st.missing ? "#a0301f" : "#1e4620" }}>{st.missing ? `${st.missing} missing` : "✓ All in"}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-5">
        {adding && p.canEdit && <AddEvent {...p} onDone={(id) => { setAdding(false); setSel(id); }} onCancel={() => setAdding(false)} />}
        {selected && !adding && <EventDetail key={selected.id} ev={selected} {...p} />}
        {!selected && !adding && <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>Click an event to see its documents.{p.canEdit ? "" : ""}</p>}
      </div>
    </div>
  );
}

function AddEvent({ eventTypes, typeDocs, lib, onDone, onCancel }: Props & { onDone: (id: string) => void; onCancel: () => void }) {
  const [type, setType] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const libBy = Object.fromEntries(lib.map((d) => [d.code, d]));
  const preview = typeDocs.filter((d) => d.event_type === type);
  const cats = Array.from(new Set(eventTypes.map((t) => t.category)));

  return (
    <div className="p-4" style={box}>
      <div className="mb-3 text-[14px] font-bold">Add an event</div>
      <div className="grid gap-3 md:grid-cols-2">
        <select className="input-field" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">What happened?</option>
          {cats.map((c) => (
            <optgroup key={c} label={c}>{eventTypes.filter((t) => t.category === c).map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}</optgroup>
          ))}
        </select>
        <input type="date" className="input-field" value={date} onChange={(e) => setDate(e.target.value)} />
        <input className="input-field" placeholder="Title — e.g. Seed round" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="input-field" placeholder="Amount, if any — e.g. ₹4.2 Cr" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <input className="input-field md:col-span-2" placeholder="Short description" value={desc} onChange={(e) => setDesc(e.target.value)} />
      </div>
      {type && (
        <div className="mt-3 p-3 text-[12.5px]" style={{ background: "#f8f4ea", borderRadius: 8 }}>
          <b>This will ask for {preview.filter((d) => d.need === "expected").length} documents</b>
          {preview.some((d) => d.need === "if_applies") && <> and {preview.filter((d) => d.need === "if_applies").length} more only if they apply</>}:
          <div className="mt-1" style={{ color: "var(--ink-secondary)" }}>{preview.filter((d) => d.need === "expected").map((d) => libBy[d.doc_code]?.name).join(" · ") || "None — add documents yourself after creating it."}</div>
        </div>
      )}
      {err && <p className="mt-2 text-[12px]" style={{ color: "#8c1a1a" }}>{err}</p>}
      <div className="mt-3 flex gap-2">
        <button className={btn} style={{ ...btnStyle, background: "var(--bottomline-green)", color: "#fff", borderColor: "var(--bottomline-green)" }} disabled={pending}
          onClick={() => start(async () => { try { onDone(await createEvent({ type, date, title, description: desc, amount })); } catch (e) { setErr((e as Error).message); } })}>
          {pending ? "Adding…" : "Add event"}
        </button>
        <button className={btn} style={btnStyle} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function EventDetail({ ev, canEdit, companyId, lib, eventTypes, typeDocs, eventDocs }: Props & { ev: EventRow }) {
  const t = eventTypes.find((x) => x.code === ev.type)!;
  const c = CATEGORY_COLOUR[t.category] ?? "#888";
  const libBy = Object.fromEntries(lib.map((d) => [d.code, d]));
  const rows = eventDocs.filter((d) => d.event_id === ev.id);
  const mine = typeDocs.filter((d) => d.event_type === ev.type);
  const expected = mine.filter((d) => d.need === "expected");
  const optional = mine.filter((d) => d.need === "if_applies");
  const known = new Set(mine.map((d) => d.doc_code));
  const addedCodes = Array.from(new Set(rows.filter((r) => r.doc_code && !known.has(r.doc_code)).map((r) => r.doc_code!)));
  const others = rows.filter((r) => !r.doc_code);
  const st = eventStats(expected.map((d) => d.doc_code), rows);
  const pct = st.total ? Math.round((st.done / st.total) * 100) : 100;

  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useRef<{ code: string | null; other?: string } | null>(null);
  const [choice, setChoice] = useState("");
  const [otherName, setOtherName] = useState("");

  function pickFile(code: string | null, other?: string) {
    pending.current = { code, other };
    fileRef.current?.click();
  }
  async function onFile(f: File | undefined) {
    const target = pending.current;
    if (!f || !target) return;
    setBusy(target.code ?? "other"); setErr("");
    try {
      const path = await putFile(companyId, f);
      start(async () => {
        try { await addEventDocument({ eventId: ev.id, docCode: target.code, otherName: target.other, storagePath: path, filename: f.name }); setChoice(""); setOtherName(""); }
        catch (e) { setErr((e as Error).message); }
        setBusy("");
      });
    } catch (e) { setErr((e as Error).message); setBusy(""); }
    if (fileRef.current) fileRef.current.value = "";
  }
  function na(code: string) {
    start(async () => { try { await markEventDocNotApplicable(ev.id, code, "Does not apply to this event"); } catch (e) { setErr((e as Error).message); } });
  }

  function Row({ code, note, optionalRow }: { code: string; note?: string | null; optionalRow?: boolean }) {
    const d = libBy[code];
    const state = docState(rows, code);
    const up = rows.filter((r) => r.doc_code === code && r.status === "uploaded").sort((a, b) => b.at.localeCompare(a.at))[0];
    const naRow = rows.find((r) => r.doc_code === code && r.status === "not_applicable");
    return (
      <div className="flex flex-wrap items-center gap-3 border-b py-2" style={{ borderColor: "var(--rule)" }}>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold">{d?.name}{d?.form && <span className="ml-1.5 px-1.5 py-px text-[10.5px] font-bold" style={{ background: "#f1ece0", color: "#26527f", borderRadius: 4 }}>{d.form}</span>}</div>
          <div className="text-[11.5px]" style={{ color: "var(--ink-secondary)" }}>
            {up ? `${up.filename} · ${up.by_name} · ${fmtDate(up.at.slice(0, 10))}` : naRow ? `“${naRow.na_reason}” · ${naRow.by_name}` : note ?? ""}
          </div>
        </div>
        <span className="px-2 py-0.5 text-[11.5px] font-semibold" style={{ borderRadius: 5, background: state === "uploaded" ? "#eef3ec" : state ? "#f1ece0" : optionalRow ? "#f1ece0" : "#fbe7e3", color: state === "uploaded" ? "#1e4620" : state ? "#57544a" : optionalRow ? "#57544a" : "#a0301f" }}>
          {state === "uploaded" ? "Uploaded" : state ? "Not applicable" : optionalRow ? "If applicable" : "Missing"}
        </span>
        {up && <button className={btn} style={btnStyle} onClick={() => download(up.storage_path!)}>Download</button>}
        {canEdit && !up && <button className={btn} style={btnStyle} disabled={busy === code} onClick={() => pickFile(code)}>{busy === code ? "Uploading…" : "Upload"}</button>}
        {canEdit && !state && optionalRow && <button className={btn} style={btnStyle} onClick={() => na(code)}>Not applicable</button>}
      </div>
    );
  }

  const rest = lib.filter((d) => !known.has(d.code));
  const heading = "mt-4 mb-1 text-[11px] font-semibold uppercase tracking-[.1em]";
  return (
    <div className="p-5" style={{ ...box, borderLeft: `4px solid ${c}` }}>
      <input ref={fileRef} type="file" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      <div className="flex items-start justify-between gap-5 border-b pb-3" style={{ borderColor: "var(--rule)" }}>
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[.08em]" style={{ color: "var(--ink-secondary)" }}>
            <i style={{ width: 9, height: 9, borderRadius: "50%", background: c }} />{t.category} · {t.name}
          </div>
          <div className="my-1 text-[19px] font-semibold">{ev.title}</div>
          <div className="text-[12.5px]" style={{ color: "var(--ink-secondary)" }}>{fmtDate(ev.event_date)}{ev.description ? ` · ${ev.description}` : ""}</div>
          {ev.amount && <div className="mt-2 inline-block px-2.5 py-1 text-[12px]" style={{ background: "#f8f4ea", borderRadius: 8 }}><span style={{ color: "var(--ink-secondary)" }}>Amount </span>{ev.amount}</div>}
        </div>
        <div style={{ width: 84, height: 84, borderRadius: "50%", background: `conic-gradient(${c} ${pct}%, #ece6d7 0)`, display: "grid", placeItems: "center", flex: "0 0 auto" }}>
          <div style={{ width: 66, height: 66, borderRadius: "50%", background: "#fff", display: "grid", placeItems: "center", textAlign: "center", lineHeight: 1.1 }}>
            <div><b style={{ fontSize: 17, display: "block" }}>{st.done}/{st.total}</b><span style={{ fontSize: 10.5 }}>in</span></div>
          </div>
        </div>
      </div>
      {err && <p className="mt-2 text-[12px]" style={{ color: "#8c1a1a" }}>{err}</p>}

      <div className={heading} style={{ color: "var(--ink-secondary)" }}>Expected</div>
      {expected.length === 0 && <div className="py-2 text-[12.5px]" style={{ color: "var(--ink-secondary)" }}>No fixed list for this kind of event — add what belongs below.</div>}
      {expected.map((d) => <Row key={d.doc_code} code={d.doc_code} />)}
      {optional.length > 0 && <div className={heading} style={{ color: "var(--ink-secondary)" }}>Only if it applies</div>}
      {optional.map((d) => <Row key={d.doc_code} code={d.doc_code} note={d.condition_note ? d.condition_note[0].toUpperCase() + d.condition_note.slice(1) : null} optionalRow />)}
      {(addedCodes.length > 0 || others.length > 0) && <div className={heading} style={{ color: "var(--ink-secondary)" }}>Added by the practitioner</div>}
      {addedCodes.map((code) => <Row key={code} code={code} />)}
      {others.map((r) => (
        <div key={r.id} className="flex items-center gap-3 border-b py-2" style={{ borderColor: "var(--rule)" }}>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold">{r.other_name}<span className="ml-1.5 px-1.5 py-px text-[10.5px] font-bold" style={{ background: "#f1ece0", color: "#57544a", borderRadius: 4 }}>Other</span></div>
            <div className="text-[11.5px]" style={{ color: "var(--ink-secondary)" }}>{r.filename} · {r.by_name} · {fmtDate(r.at.slice(0, 10))}</div>
          </div>
          <span className="px-2 py-0.5 text-[11.5px] font-semibold" style={{ borderRadius: 5, background: "#eef3ec", color: "#1e4620" }}>Uploaded</span>
          <button className={btn} style={btnStyle} onClick={() => download(r.storage_path!)}>Download</button>
        </div>
      ))}

      {canEdit && (
        <div className="mt-4 p-3.5" style={{ background: "#f8f4ea", borderRadius: 10 }}>
          <div className="mb-2 text-[13px] font-semibold">Add a document to this event</div>
          <div className="flex flex-wrap gap-2">
            <select className="input-field" style={{ flex: 1, minWidth: 240 }} value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">Choose the document…</option>
              <optgroup label={`Relevant to ${t.name.toLowerCase()}`}>{mine.map((d) => <option key={d.doc_code} value={d.doc_code}>{libBy[d.doc_code]?.form ? `${libBy[d.doc_code].form} — ` : ""}{libBy[d.doc_code]?.name}</option>)}</optgroup>
              <optgroup label="All other forms and documents">{rest.map((d) => <option key={d.code} value={d.code}>{d.form ? `${d.form} — ` : ""}{d.name}</option>)}</optgroup>
              <option value="__other">Other — not in this list</option>
            </select>
            <button className={btn} style={{ ...btnStyle, background: "var(--bottomline-green)", color: "#fff", borderColor: "var(--bottomline-green)" }}
              disabled={!choice || (choice === "__other" && !otherName.trim())}
              onClick={() => (choice === "__other" ? pickFile(null, otherName) : pickFile(choice))}>
              Choose file &amp; add
            </button>
          </div>
          {choice === "__other" && <input className="input-field mt-2" placeholder="Name this document — e.g. Investor side letter" value={otherName} onChange={(e) => setOtherName(e.target.value)} />}
          <div className="mt-1.5 text-[11.5px]" style={{ color: "var(--ink-secondary)" }}>Relevant documents come first. Pick “Other” and name it if it isn&apos;t listed.</div>
        </div>
      )}
    </div>
  );
}
