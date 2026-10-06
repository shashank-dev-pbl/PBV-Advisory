"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { safeStorageSegment } from "@/lib/storagePath";
import { FileRow, VersionHistory, sortedFiles, sortedMessages } from "@/app/founder/shared";
import { recordUpload, deleteFile, markNilReturn, sendFounderMessage } from "@/app/founder/actions";
import { acceptItem, markNotApplicable, sendPractitionerMessage } from "@/app/practitioner/actions";
import { RANK, STATUS_TAG, TIERS, daysLate, dueLabel, isDone, rowKey, shortDate, type RowKey } from "@/lib/uploads";
import type { Who } from "@/lib/access";
import type { DocItem, DocPriority } from "@/lib/types";

type Names = Record<string, string>;

const ICONS: Record<RowKey | "done", React.ReactNode> = {
  done: (
    <svg viewBox="0 0 18 18"><circle cx="9" cy="9" r="8" fill="#dfe9dc" /><path d="M5.3 9.2l2.4 2.4 5-5.2" fill="none" stroke="#1e4620" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  todo: <svg viewBox="0 0 18 18"><circle cx="9" cy="9" r="7.2" fill="none" stroke="#b9b3a3" strokeWidth="1.6" /></svg>,
  late: (
    <svg viewBox="0 0 18 18"><circle cx="9" cy="9" r="8" fill="#fbe9e7" /><path d="M9 4.8v5.2" stroke="#b3261e" strokeWidth="2" strokeLinecap="round" /><circle cx="9" cy="12.9" r="1.2" fill="#b3261e" /></svg>
  ),
  submitted: (
    <svg viewBox="0 0 18 18"><circle cx="9" cy="9" r="7.2" fill="none" stroke="#26527f" strokeWidth="1.6" /><path d="M9 1.8a7.2 7.2 0 010 14.4z" fill="#26527f" /></svg>
  ),
  query: (
    <svg viewBox="0 0 18 18"><circle cx="9" cy="9" r="8" fill="#fdf3dd" /><path d="M6.8 7a2.3 2.3 0 114 1.5c-.8.6-1.8 1-1.8 2.3" fill="none" stroke="#8a6412" strokeWidth="1.7" strokeLinecap="round" /><circle cx="9" cy="13.4" r="1.1" fill="#8a6412" /></svg>
  ),
  accepted: null,
  nil: null,
  na: null,
};

function StatusIcon({ k }: { k: RowKey }) {
  return <span style={{ width: 18, height: 18, flex: "0 0 auto", display: "inline-block" }}>{isDone(k) ? ICONS.done : ICONS[k]}</span>;
}

// The ⓘ: hover or focus shows what the item is, in plain words.
function Tip({ text }: { text: string }) {
  return (
    <span
      tabIndex={0}
      onClick={(e) => e.stopPropagation()}
      className="tip-i"
      data-tip={text}
      aria-label={text}
      style={{ marginLeft: 6 }}
    >
      i
    </span>
  );
}

type RowProps = {
  item: DocItem;
  who: Who;
  companyId: string;
  userId: string;
  today: string;
  names: Names;
  onPatch: (id: string, patch: Partial<DocItem>) => void;
};

function UploadRow({ item, who, companyId, userId, today, names, onPatch }: RowProps) {
  const key = rowKey(item, today);
  const done = isDone(key);
  const [open, setOpen] = useState(key === "query");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [label, setLabel] = useState("");
  const [reply, setReply] = useState("");
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const [naOpen, setNaOpen] = useState(false);
  const [naReason, setNaReason] = useState("");
  const [confirmNil, setConfirmNil] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const addInput = useRef<HTMLInputElement>(null);

  const isFounder = who === "founder";
  const isExternal = who === "external";
  const isReviewer = who === "pba" || who === "admin";
  const files = sortedFiles(item.doc_file);
  const latest = files[0] ?? null;
  const messages = sortedMessages(item);
  const fromExt = item.supplied_by_external;
  const canUpload = isFounder || isExternal;
  const canDelete = canUpload && !done;
  const accepter = item.accepted_by ? names[item.accepted_by] ?? "Prime Bottomline" : "";
  const decider = item.na_by ? names[item.na_by] ?? "Prime Bottomline" : "";

  async function guarded(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong — try again.");
    }
    setBusy(false);
  }

  function upload(file: File, fileLabel?: string, add = false) {
    return guarded(async () => {
      const path = `${companyId}/${item.id}/${Date.now()}-${safeStorageSegment(file.name)}`;
      const { error: uploadError } = await createClient().storage.from("docs").upload(path, file);
      if (uploadError) throw new Error(uploadError.message);
      await recordUpload(item.id, path, file.name, fileLabel);
      const row = { id: path, doc_item_id: item.id, storage_path: path, filename: file.name, label: fileLabel ?? null, uploaded_at: new Date().toISOString() };
      onPatch(item.id, { status: "uploaded", doc_file: add || item.allows_multiple ? [...(item.doc_file ?? []), row] : [row] });
      setLabel("");
    });
  }

  function removeFile(fileId: string) {
    return guarded(async () => {
      await deleteFile(fileId, item.id);
      const remaining = (item.doc_file ?? []).filter((f) => f.id !== fileId);
      onPatch(item.id, remaining.length > 0 ? { doc_file: remaining } : { doc_file: remaining, status: "pending" });
    });
  }

  const meta = (() => {
    if (done) {
      if (key === "nil") return `Declared none${item.na_at ? ` on ${shortDate(item.na_at)}` : ""}${decider ? ` by ${decider}` : ""}`;
      if (key === "na") return `Marked not applicable${item.na_at ? ` on ${shortDate(item.na_at)}` : ""}${decider ? ` by ${decider}` : ""}${item.na_reason ? ` · ${item.na_reason}` : ""}`;
      return `Accepted${item.accepted_at ? ` on ${shortDate(item.accepted_at)}` : ""}${accepter ? ` by ${accepter}` : ""} · ${files.length} file${files.length === 1 ? "" : "s"}`;
    }
    const parts: string[] = [];
    if (fromExt) parts.push("From the external practitioner");
    if (item.priority !== "must") parts.push("Asked once, never chased");
    if (key === "late") parts.push(`Was due ${shortDate(item.due_date!)} · ${daysLate(item, today)} day${daysLate(item, today) === 1 ? "" : "s"} late`);
    else if (key === "submitted") parts.push(`${files.length} file${files.length === 1 ? "" : "s"} with us`);
    else parts.push(dueLabel(item));
    return parts.join(" · ");
  })();

  const tag = STATUS_TAG[key];

  return (
    <div style={{ borderBottom: "1px solid var(--rule)" }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((v) => !v); } }}
        className="flex items-center gap-3 px-3.5 py-2.5"
        style={{ cursor: "pointer", background: open ? "rgba(0,0,0,0.025)" : "transparent" }}
      >
        <StatusIcon k={key} />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px]" style={{ fontWeight: done ? 500 : 600, color: done ? "var(--ink-secondary)" : "var(--ink)" }}>
            {item.title}
            <Tip text={item.description} />
          </p>
          <p className="text-[12px]" style={{ color: key === "late" ? "#b3261e" : "var(--ink-secondary)", fontWeight: key === "late" ? 600 : 400 }}>{meta}</p>
        </div>
        <span className="pill hidden flex-shrink-0 sm:inline-block" style={{ background: tag.bg, color: tag.color }}>{tag.label}</span>

        {/* the one quick action */}
        {canUpload && (key === "todo" || key === "late") && (
          <button
            onClick={(e) => { e.stopPropagation(); fileInput.current?.click(); }}
            disabled={busy}
            className="btn-small flex-shrink-0"
            style={item.priority === "must" ? { background: "var(--bottomline-green)", color: "var(--paper)", border: "1px solid var(--bottomline-green)" } : { background: "transparent", color: "var(--bottomline-green)", border: "1px solid var(--bottomline-green)" }}
          >
            {busy ? "Uploading…" : "Upload"}
          </button>
        )}
        {isFounder && key === "query" && (
          <button onClick={(e) => { e.stopPropagation(); setOpen(true); }} className="btn-small flex-shrink-0" style={{ background: "transparent", color: "var(--bottomline-green)", border: "1px solid var(--bottomline-green)" }}>Reply</button>
        )}
        {isReviewer && key === "submitted" && (
          <button
            onClick={(e) => { e.stopPropagation(); void guarded(async () => { await acceptItem(item.id); onPatch(item.id, { status: "accepted", accepted_at: new Date().toISOString(), accepted_by: userId }); }); }}
            disabled={busy}
            className="btn-small flex-shrink-0"
            style={{ background: "var(--bottomline-green)", color: "var(--paper)", border: "1px solid var(--bottomline-green)" }}
          >
            Accept
          </button>
        )}
        <span style={{ color: "var(--ink-secondary)", fontSize: 11 }}>{open ? "▴" : "▾"}</span>
      </div>

      <input ref={fileInput} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />

      {open && (
        <div className="px-3.5 pb-4 pt-1" style={{ background: "rgba(0,0,0,0.025)" }}>
          <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>{item.description}</p>

          {files.length > 0 && (
            <div className="mt-2 flex flex-col gap-1">
              {item.allows_multiple
                ? files.map((f) => (
                    <div key={f.id}>
                      {f.label && <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--ink-secondary)" }}>{f.label}</p>}
                      <FileRow filename={f.filename} storagePath={f.storage_path} onDelete={canDelete ? () => void removeFile(f.id) : undefined} />
                    </div>
                  ))
                : latest && (
                    <>
                      <FileRow filename={latest.filename} storagePath={latest.storage_path} onDelete={canDelete ? () => void removeFile(latest.id) : undefined} />
                      {files.length > 1 && <VersionHistory files={files.slice(1)} />}
                    </>
                  )}
            </div>
          )}

          {messages.length > 0 && (
            <div className="mt-3 p-3" style={{ background: "#fdf3dd", borderRadius: 8 }}>
              <div className="flex flex-col gap-2">
                {messages.map((m) => (
                  <div key={m.id} className="text-[13px]" style={{ color: "#4d3c14" }}>
                    <span className="text-[11px] font-semibold" style={{ color: "#8a6412" }}>
                      {m.sender === "founder" ? "Founder" : "Prime Bottomline"} · {shortDate(m.created_at)}
                    </span>
                    <br />
                    {m.body}
                  </div>
                ))}
              </div>
              {isFounder && key === "query" && (
                <>
                  <textarea
                    className="input-field mt-2"
                    style={{ minHeight: 54, fontSize: 13, background: "#fff" }}
                    placeholder="Your reply"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                  />
                  <button
                    onClick={() => void guarded(async () => {
                      const body = reply.trim();
                      await sendFounderMessage(item.id, body);
                      onPatch(item.id, { status: "uploaded", doc_item_message: [...(item.doc_item_message ?? []), { id: `local-${Date.now()}`, doc_item_id: item.id, sender: "founder", body, created_at: new Date().toISOString() }] });
                      setReply("");
                    })}
                    disabled={busy || !reply.trim()}
                    className="btn-small mt-2"
                    style={{ background: "var(--bottomline-green)", color: "var(--paper)", border: "1px solid var(--bottomline-green)" }}
                  >
                    Send reply
                  </button>
                  <p className="mt-1.5 text-[11.5px]" style={{ color: "#8a6412" }}>We can&apos;t accept this item until the question is answered.</p>
                </>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {/* several files, each named — e.g. one bank statement per account */}
            {canUpload && !done && item.allows_multiple && (
              <>
                {item.needs_label && (
                  <input className="input-field" style={{ minHeight: 34, padding: "6px 8px", fontSize: 12.5, maxWidth: 240 }} placeholder="Name this file (e.g. HDFC current account)" value={label} onChange={(e) => setLabel(e.target.value)} />
                )}
                <button onClick={() => addInput.current?.click()} disabled={busy || (item.needs_label && !label.trim())} className="btn-small" style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)", opacity: item.needs_label && !label.trim() ? 0.5 : 1 }}>
                  {files.length ? "Add another file" : "Upload file"}
                </button>
                <input ref={addInput} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, label.trim() || undefined, true); e.target.value = ""; }} />
              </>
            )}
            {canUpload && !done && !item.allows_multiple && files.length > 0 && (
              <button onClick={() => fileInput.current?.click()} disabled={busy} className="btn-small" style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)" }}>Replace file</button>
            )}
            {isFounder && !fromExt && !done && item.nil_return_allowed && files.length === 0 && (
              <button
                onClick={() => {
                  if (!confirmNil) { setConfirmNil(true); return; }
                  void guarded(async () => {
                    await markNilReturn(item.id);
                    onPatch(item.id, { status: "not_applicable", na_reason: "Founder confirmed — none to report", na_at: new Date().toISOString(), na_by: userId });
                  });
                }}
                disabled={busy}
                className="btn-small"
                style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)" }}
              >
                {confirmNil ? "Confirm — we have none" : "We have none"}
              </button>
            )}
            {isExternal && fromExt && !done && files.length === 0 && (
              <span className="text-[12px]" style={{ color: "var(--ink-secondary)" }}>Usually comes from you — the founder can upload it too.</span>
            )}
          </div>

          {/* PBA: ask a question, or mark not applicable */}
          {isReviewer && !done && (
            <div className="mt-3 flex flex-col gap-2">
              {!asking && !naOpen && (
                <div className="flex gap-2">
                  {(key === "submitted" || key === "todo" || key === "late") && (
                    <button onClick={() => setAsking(true)} className="btn-small" style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)" }}>Ask a question</button>
                  )}
                  <button onClick={() => setNaOpen(true)} className="btn-small" style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)" }}>Not applicable</button>
                </div>
              )}
              {asking && (
                <div className="flex flex-col gap-2">
                  <textarea className="input-field" style={{ minHeight: 54, fontSize: 13 }} placeholder="What do you need to know? The item stays open until the founder replies." value={question} onChange={(e) => setQuestion(e.target.value)} />
                  <div className="flex gap-2">
                    <button
                      onClick={() => void guarded(async () => {
                        const body = question.trim();
                        await sendPractitionerMessage(item.id, body);
                        onPatch(item.id, { status: "query", doc_item_message: [...(item.doc_item_message ?? []), { id: `local-${Date.now()}`, doc_item_id: item.id, sender: "practitioner", body, created_at: new Date().toISOString() }] });
                        setAsking(false);
                        setQuestion("");
                      })}
                      disabled={busy || !question.trim()}
                      className="btn-small"
                      style={{ background: "var(--ink)", color: "var(--paper)", border: "1px solid var(--ink)" }}
                    >
                      Send question
                    </button>
                    <button onClick={() => setAsking(false)} className="btn-small" style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)" }}>Cancel</button>
                  </div>
                </div>
              )}
              {naOpen && (
                <div className="flex flex-wrap gap-2">
                  <input className="input-field" style={{ minHeight: 34, padding: "6px 8px", fontSize: 13, flex: 1, minWidth: 220 }} placeholder="Why is this not applicable?" value={naReason} onChange={(e) => setNaReason(e.target.value)} />
                  <button
                    onClick={() => void guarded(async () => {
                      await markNotApplicable(item.id, naReason.trim());
                      onPatch(item.id, { status: "not_applicable", na_reason: naReason.trim(), na_at: new Date().toISOString(), na_by: userId });
                      setNaOpen(false);
                    })}
                    disabled={busy || !naReason.trim()}
                    className="btn-small"
                    style={{ background: "var(--ink)", color: "var(--paper)", border: "1px solid var(--ink)" }}
                  >
                    Confirm not applicable
                  </button>
                  <button onClick={() => setNaOpen(false)} className="btn-small" style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)" }}>Cancel</button>
                </div>
              )}
            </div>
          )}
          {error && <p className="mt-2 text-[12px]" style={{ color: "#8c1a1a" }}>{error}</p>}
        </div>
      )}
    </div>
  );
}

export default function UploadsBoard({
  items: initial, who, companyId, userId, today, names,
}: {
  items: DocItem[];
  who: Who;
  companyId: string;
  userId: string;
  today: string;
  names: Names;
}) {
  const [items, setItems] = useState(initial);
  const [showDone, setShowDone] = useState<Record<string, boolean>>({});
  const [showOthers, setShowOthers] = useState(false);

  function patch(id: string, p: Partial<DocItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...p } : i)));
  }

  const tiers = (["must", "good", "cosmetic"] as DocPriority[])
    .map((p) => {
      const all = items.filter((i) => i.priority === p);
      const rows = all
        .map((i) => ({ i, k: rowKey(i, today) }))
        .sort((a, b) => RANK[a.k] - RANK[b.k]);
      const doneRows = rows.filter((r) => isDone(r.k));
      const openRows = rows.filter((r) => !isDone(r.k));
      // what is waiting on the founder: to do, late, or a question; things the external practitioner supplies don't count
      const needFounder = rows.filter((r) => ["late", "todo", "query"].includes(r.k) && !r.i.supplied_by_external).length;
      return { p, all, doneRows, openRows, needFounder };
    })
    .filter((t) => t.all.length > 0);

  if (items.length === 0) {
    return <p className="text-[14px]" style={{ color: "var(--ink-secondary)" }}>Nothing in this tab yet.</p>;
  }

  return (
    <div>
      <div className="mb-6 grid gap-2.5 md:grid-cols-3">
        {tiers.map((t) => {
          const T = TIERS[t.p];
          const d = t.doneRows.length;
          const n = t.all.length;
          return (
            <a key={t.p} href={`#tier-${t.p}`} className="block p-3.5" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderTop: `3px solid ${T.color}`, borderRadius: 10, textDecoration: "none", color: "inherit" }}>
              <div className="flex items-center gap-1.5 text-[13.5px] font-bold">
                <i style={{ width: 9, height: 9, borderRadius: "50%", background: T.color, display: "inline-block" }} />
                {T.name}
                <Tip text={T.tip} />
              </div>
              <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--ink-secondary)" }}><b style={{ fontSize: 17, color: "var(--ink)" }}>{d}</b> of {n} done</p>
              <div style={{ height: 6, background: T.soft, borderRadius: 4, marginTop: 6, overflow: "hidden" }}>
                <div style={{ width: `${n ? (d / n) * 100 : 0}%`, height: "100%", background: T.color }} />
              </div>
              <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--ink-secondary)" }}>
                {t.needFounder ? `${t.needFounder} need${t.needFounder === 1 ? "s" : ""} ${who === "founder" ? "you" : "the founder"}` : "Nothing waiting on the founder"}
              </p>
            </a>
          );
        })}
      </div>

      {tiers.map((t) => {
        const T = TIERS[t.p];
        const collapsed = t.p === "cosmetic" && !showOthers;
        const doneShown = showDone[t.p];
        const row = (r: { i: DocItem }) => (
          <UploadRow key={r.i.id} item={r.i} who={who} companyId={companyId} userId={userId} today={today} names={names} onPatch={patch} />
        );
        return (
          <section key={t.p} id={`tier-${t.p}`} className="mb-6" style={{ scrollMarginTop: 16 }}>
            <div className="flex items-center gap-2 px-3.5 py-2.5" style={{ background: T.soft, border: "1px solid var(--rule)", borderLeft: `4px solid ${T.color}`, borderRadius: "10px 10px 0 0" }}>
              <i style={{ width: 9, height: 9, borderRadius: "50%", background: T.color, display: "inline-block" }} />
              <span className="text-[13px] font-bold" style={{ color: T.color, letterSpacing: "0.02em" }}>{T.name}</span>
              <Tip text={T.tip} />
              <span className="ml-auto text-[12px]" style={{ color: "var(--ink-secondary)" }}>{t.doneRows.length} of {t.all.length} done</span>
            </div>
            <div style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderTop: 0, borderLeft: `4px solid ${T.color}`, borderRadius: "0 0 10px 10px" }}>
              {collapsed ? (
                <button onClick={() => setShowOthers(true)} className="w-full px-3.5 py-2.5 text-left text-[12.5px] font-semibold" style={{ color: "var(--bottomline-green)", background: "none", border: "none", cursor: "pointer" }}>
                  Show {t.all.length} other items ▾
                </button>
              ) : (
                <>
                  {t.openRows.length === 0 && <p className="px-3.5 py-3 text-[13px]" style={{ color: "var(--ink-secondary)" }}>All done here.</p>}
                  {t.openRows.map(row)}
                  {t.doneRows.length > 0 && (
                    <>
                      {doneShown && t.doneRows.map(row)}
                      <button onClick={() => setShowDone({ ...showDone, [t.p]: !doneShown })} className="w-full px-3.5 py-2.5 text-left text-[12.5px] font-semibold" style={{ color: "var(--bottomline-green)", background: "none", border: "none", borderTop: "1px solid var(--rule)", cursor: "pointer" }}>
                        {doneShown ? "Hide completed ▴" : `Show ${t.doneRows.length} completed ▾`}
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </section>
        );
      })}

      <p className="mt-6 text-center text-[12px]" style={{ color: "var(--ink-secondary)" }}>
        Only Mandatory items can delay your report. Click any row for details; hover the <Tip text="Like this — a short note on what the item is." /> for a quick explanation.
      </p>
    </div>
  );
}
