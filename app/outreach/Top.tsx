"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { scanNow } from "./actions";
import { fmtDayLong } from "@/lib/outreach";
import { useToast } from "./Toast";

// The title bar of every Outreach screen: where you are, today's date (India), and the daily scan on demand.
export default function Top({ title }: { title: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, show] = useToast();
  const [notes, setNotes] = useState<string[] | null>(null);
  const run = () =>
    start(async () => {
      const r = await scanNow();
      if (!r.ok) return show(r.error);
      setNotes(r.data.notes);
      show(r.data.ok ? "Scan finished" : r.data.notes[0] ?? "Scan failed");
      router.refresh();
    });
  return (
    <>
      <div className="top">
        <h1>{title}</h1>
        <div className="sp" />
        <div className="clock">Today: {fmtDayLong(new Date().toISOString())}</div>
        <button className="btn" onClick={run} disabled={pending} title="Run the daily job now: pull Source 1, verify, move companies on">
          {pending ? "Scanning…" : "Run scan now ▸"}
        </button>
      </div>
      {notes && (
        <div className="wrap" style={{ paddingBottom: 0 }}>
          <div className="banner">
            <b>Scan result</b>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setNotes(null)}>Dismiss</button>
          </div>
        </div>
      )}
      {toast}
    </>
  );
}
