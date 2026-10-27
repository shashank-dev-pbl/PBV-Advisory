"use client";

import { useState, useTransition } from "react";
import "../proto.css";
import { unwrap } from "@/lib/actionResult";
import { fillTestCompany, resetTestCompany } from "./actions";

// Like the prototype's "Fill with Xploro" / "Start over", for the test company only.
export default function DemoBar() {
  const [busy, start] = useTransition();
  const [what, setWhat] = useState("");
  const [err, setErr] = useState("");
  const [ask, setAsk] = useState<null | "fill" | "reset">(null);
  const run = (kind: "fill" | "reset") => start(async () => {
    setErr(""); setWhat(kind); setAsk(null);
    try { unwrap(await (kind === "fill" ? fillTestCompany() : resetTestCompany())); window.location.reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not do that"); setWhat(""); }
  });
  return (
    <div style={{ background: "#26527f", color: "#fff", fontSize: 12.5, padding: "6px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <b>Test company</b><span style={{ opacity: 0.85 }}>— sample data only, never shown on the live site.</span>
      <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
        {err && <span style={{ background: "#fbe9e7", color: "#8c1a1a", padding: "2px 8px", borderRadius: 6 }}>{err}</span>}
        {busy && <span>{what === "fill" ? "Filling with Xploro… about 20 seconds" : "Resetting…"}</span>}
        <button disabled={busy} onClick={() => setAsk("fill")} style={{ background: "#fff", color: "#26527f", borderRadius: 6, padding: "3px 10px", fontWeight: 700 }}>Fill with Xploro</button>
        <button disabled={busy} onClick={() => setAsk("reset")} style={{ background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,.6)", borderRadius: 6, padding: "3px 10px" }}>Reset everything</button>
      </span>
      {busy && (
        <div role="status" aria-live="polite" style={{ position: "fixed", inset: 0, background: "rgba(244,240,230,.82)", display: "grid", placeItems: "center", zIndex: 120 }}>
          <div style={{ background: "#fff", color: "#1a1a1a", borderRadius: 12, padding: "20px 26px", textAlign: "center", boxShadow: "0 8px 30px rgba(0,0,0,.15)" }}>
            <div className="p5"><span className="spin" style={{ width: 22, height: 22 }} /></div>
            <div style={{ fontWeight: 700, marginTop: 10 }}>{what === "fill" ? "Filling with Xploro…" : "Resetting…"}</div>
            <div style={{ fontSize: 12.5, opacity: 0.7, marginTop: 2 }}>{what === "fill" ? "About 20 seconds. Please don't click anything." : "A few seconds."}</div>
          </div>
        </div>
      )}
      {ask && (
        <div role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) setAsk(null); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "grid", placeItems: "center", zIndex: 100 }}>
          <div style={{ background: "#fff", color: "#1a1a1a", borderRadius: 12, padding: 22, maxWidth: 440 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{ask === "fill" ? "Fill this company with Xploro?" : "Reset everything?"}</div>
            <p style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.5 }}>{ask === "fill"
              ? "This replaces everything in this test company with the prototype's Xploro: a finished company master, 18 months of figures, documents, and Legal requests in every state. Anything entered here now is removed."
              : "This clears the test company completely: master answers, files, months, figures and Legal. You start from an empty company, as a new customer would."}</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setAsk(null)} style={{ padding: "6px 14px", border: "1px solid #d8cfbc", borderRadius: 8 }}>Cancel</button>
              <button onClick={() => run(ask)} style={{ padding: "6px 14px", background: ask === "reset" ? "#b3261e" : "#004d00", color: "#fff", borderRadius: 8, fontWeight: 700 }}>{ask === "fill" ? "Fill with Xploro" : "Reset everything"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
