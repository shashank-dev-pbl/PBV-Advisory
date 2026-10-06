"use client";

import { useState, useTransition } from "react";
import { postMonthlyLine } from "./actions";

export default function MonthlyLine({ firm, periodLabel, dueLabel, line, canPost }: {
  firm: string; periodLabel: string; dueLabel: string;
  line: { body: string; posted_by_name: string | null; posted_at: string } | null; canPost: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(line?.body ?? "");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="mb-7 p-4" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 10 }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[.1em]" style={{ color: "var(--ink-secondary)" }}>{firm}&apos;s monthly line · {periodLabel} · due by {dueLabel}</div>
          {line && !editing ? (
            <>
              <p className="mt-1 text-[15px] font-semibold">{line.body}</p>
              <p className="mt-1 text-[11.5px]" style={{ color: "var(--ink-secondary)" }}>Posted {new Date(line.posted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} by {line.posted_by_name}</p>
            </>
          ) : !editing ? (
            <p className="mt-1 text-[14px]" style={{ color: "var(--ink-secondary)" }}>Not posted yet for {periodLabel}.</p>
          ) : null}
        </div>
        <span className="px-2 py-0.5 text-[11.5px] font-semibold" style={{ borderRadius: 5, background: line ? "#eef3ec" : "#f1ece0", color: line ? "#1e4620" : "#57544a" }}>{line ? "Received" : "Waiting"}</span>
      </div>
      {canPost && (editing || !line) && (
        <div className="mt-3">
          <textarea className="input-field" rows={2} style={{ width: "100%" }} maxLength={400} value={text} onChange={(e) => setText(e.target.value)}
            placeholder="e.g. All filings due so far are done. GSTR-1 and GSTR-3B pending, on time. No notices received." />
          {err && <p className="mt-1 text-[12px]" style={{ color: "#8c1a1a" }}>{err}</p>}
          <button className="btn-small mt-2" style={{ background: "var(--bottomline-green)", color: "var(--paper)", border: "1px solid var(--bottomline-green)" }} disabled={pending}
            onClick={() => start(async () => { try { await postMonthlyLine(text); setEditing(false); setErr(""); } catch (e) { setErr((e as Error).message); } })}>
            {pending ? "Posting…" : "Post this month's line"}
          </button>
        </div>
      )}
      {canPost && line && !editing && <button className="mt-2 text-[12px] font-semibold underline" onClick={() => setEditing(true)}>Edit</button>}
    </div>
  );
}
