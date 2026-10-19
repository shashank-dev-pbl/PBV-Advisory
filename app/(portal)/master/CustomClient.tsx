"use client";

import { unwrap } from "@/lib/actionResult";
import { useState, useTransition } from "react";
import type { Owner } from "@/lib/compliance";
import { addCustomType, closeRegistration } from "./actions";

const box = { background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 10 } as const;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type CustomRow = { registrationId: string; name: string; frequency: string; owner: string; status: "active" | "closed"; entries: number };

export default function CustomClient({ canEdit, rows }: { canEdit: boolean; rows: CustomRow[] }) {
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState<"monthly" | "quarterly" | "yearly">("yearly");
  const [day, setDay] = useState("15");
  const [month, setMonth] = useState("3");
  const [owner, setOwner] = useState<Owner>("practitioner");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-5">
      <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>
        Your own non-statutory items, such as a Fire NOC, a factory licence or an FSSAI renewal. Each one starts generating entries on the Compliance page as soon as you add it.
      </p>
      {canEdit && (
        <section className="p-4" style={box}>
          <h2 className="mb-3 text-[14px] font-bold">Add a custom type</h2>
          <div className="grid gap-3 md:grid-cols-4">
            <label className="text-[12px] font-semibold md:col-span-2">Name<input className="input-field mt-1" placeholder="e.g. Fire NOC" value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="text-[12px] font-semibold">How often
              <select className="input-field mt-1" value={frequency} onChange={(e) => setFrequency(e.target.value as "monthly" | "quarterly" | "yearly")}>
                <option value="monthly">Every month</option><option value="quarterly">Every quarter</option><option value="yearly">Every year</option></select></label>
            <label className="text-[12px] font-semibold">Who does it
              <select className="input-field mt-1" value={owner} onChange={(e) => setOwner(e.target.value as Owner)}>
                <option value="founder">Founder</option><option value="practitioner">External practitioner</option><option value="pba">PBA practitioner</option></select></label>
            {frequency === "yearly" && (
              <label className="text-[12px] font-semibold">Due month
                <select className="input-field mt-1" value={month} onChange={(e) => setMonth(e.target.value)}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>
            )}
            <label className="text-[12px] font-semibold">Due day (1 to 28)
              <input type="number" min={1} max={28} className="input-field mt-1" value={day} onChange={(e) => setDay(e.target.value)} />
              <span className="mt-1 block text-[11px] font-normal" style={{ color: "var(--ink-secondary)" }}>{frequency === "monthly" ? "Of the month after." : frequency === "quarterly" ? "Of the month after each quarter ends." : "Within each financial year."}</span></label>
          </div>
          {err && <p className="mt-2 text-[12.5px]" style={{ color: "#8c1a1a" }}>{err}</p>}
          {msg && <p className="mt-2 text-[12.5px]" style={{ color: "#004d00" }}>{msg}</p>}
          <button className="btn-small mt-3" style={{ background: "var(--bottomline-green)", color: "var(--paper)", border: "1px solid var(--bottomline-green)" }} disabled={pending}
            onClick={() => start(async () => {
              setErr(""); setMsg("");
              try {
                const { created } = unwrap(await addCustomType({ name, frequency, day: Number(day), month: Number(month), owner }));
                setMsg(`Added. ${created} new compliance ${created === 1 ? "entry" : "entries"}.`); setName("");
              } catch (e) { setErr(e instanceof Error ? e.message : "Could not add"); }
            })}>{pending ? "Adding…" : "Add custom type"}</button>
        </section>
      )}
      <section>
        <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.1em]">Your custom types</h2>
        {rows.length === 0 ? <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>None yet.</p> : (
          <div className="grid gap-2">
            {rows.map((r) => <Row key={r.registrationId} r={r} canEdit={canEdit} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function Row({ r, canEdit }: { r: CustomRow; canEdit: boolean }) {
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 p-3" style={{ ...box, opacity: r.status === "closed" ? 0.55 : 1 }}>
      <div>
        <p className="text-[13.5px] font-semibold">{r.name}{r.status === "closed" ? " (stopped)" : ""}</p>
        <p className="text-[11.5px]" style={{ color: "var(--ink-secondary)" }}>{r.frequency} · {r.entries} entries</p>
      </div>
      {canEdit && r.status === "active" && (
        <button className="btn-small" style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)" }} disabled={pending}
          onClick={() => start(async () => { try { unwrap(await closeRegistration(r.registrationId, "Custom type removed")); } catch (e) { setErr(e instanceof Error ? e.message : "Could not stop"); } })}>
          Stop tracking</button>
      )}
      {err && <p className="w-full text-[12px]" style={{ color: "#8c1a1a" }}>{err}</p>}
    </div>
  );
}
