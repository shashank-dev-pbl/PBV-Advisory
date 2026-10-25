"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { giveFounder } from "./actions";

// Shown inside the opened row of a lead the bot could not finish (Needs review / No founder found).
export default function GiveFounder({ id, needsCompany, demo }: { id: number; needsCompany: boolean; demo: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({ founderUrl: "", founderName: "", founderTitle: "", companyUrl: "" });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const field = { minHeight: 36, padding: "6px 10px", fontSize: 13 } as const;

  const save = () => {
    setErr(null);
    if (demo) return setErr("Sample data: nothing was saved. On real leads this queues the connection request.");
    start(async () => {
      const r = await giveFounder({ id, ...f });
      if (!r.ok) return setErr(r.error);
      router.refresh();
    });
  };

  return (
    <div className="mt-4 p-3" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 8 }} onClick={(e) => e.stopPropagation()}>
      <p className="eyebrow mb-1">Fix this lead</p>
      <p className="mb-2.5 text-[12px]" style={{ color: "var(--ink-secondary)" }}>
        Add the founder the bot should contact. It sends the connection request on its next round.
      </p>
      <div className="grid gap-2">
        <input className="input-field" style={field} placeholder="Founder's LinkedIn profile link (linkedin.com/in/…)" value={f.founderUrl} onChange={set("founderUrl")} />
        <div className="grid gap-2 md:grid-cols-2">
          <input className="input-field" style={field} placeholder="Founder's name" value={f.founderName} onChange={set("founderName")} />
          <input className="input-field" style={field} placeholder="Title (optional)" value={f.founderTitle} onChange={set("founderTitle")} />
        </div>
        {needsCompany && (
          <input className="input-field" style={field} placeholder="Company's LinkedIn page (optional, linkedin.com/company/…)" value={f.companyUrl} onChange={set("companyUrl")} />
        )}
      </div>
      {err && <p className="mt-2 text-[12px]" style={{ color: "#8c1a1a" }}>{err}</p>}
      <button
        onClick={save}
        disabled={pending}
        className="btn-small mt-3"
        style={{ background: "var(--bottomline-green)", color: "var(--paper)", border: "1px solid var(--bottomline-green)", opacity: pending ? 0.6 : 1 }}
      >
        {pending ? "Saving…" : "Save and queue connection"}
      </button>
    </div>
  );
}
