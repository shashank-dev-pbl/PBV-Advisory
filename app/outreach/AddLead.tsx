"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addLead } from "./actions";

const blank = { company: "", website: "", sector: "", hq: "", raised: "", companyUrl: "", founderName: "", founderTitle: "", founderUrl: "" };

// "+ Add lead": put a company on the list by hand. Same fields the extension fills in on its own.
export default function AddLead({ demo }: { demo: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [f, setF] = useState(blank);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const field = { minHeight: 36, padding: "6px 10px", fontSize: 13 } as const;
  const label = "block text-[12px] font-semibold";

  const save = () => {
    setErr(null);
    if (demo) return setErr("Sample data: nothing was saved.");
    start(async () => {
      const r = await addLead(f);
      if (!r.ok) return setErr(r.error);
      setF(blank);
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn-small ml-auto"
        style={{ background: "var(--bottomline-green)", color: "var(--paper)", border: "1px solid var(--bottomline-green)" }}
      >
        + Add lead
      </button>
      {open && (
        <div className="mt-3 w-full p-4" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 10, flexBasis: "100%" }}>
          <p className="mb-3 text-[14px] font-bold">Add a lead</p>
          <div className="grid gap-3 md:grid-cols-3">
            <label className={label}>Company name *<input className="input-field mt-1" style={field} value={f.company} onChange={set("company")} /></label>
            <label className={label}>Website<input className="input-field mt-1" style={field} placeholder="https://…" value={f.website} onChange={set("website")} /></label>
            <label className={label}>Company LinkedIn page<input className="input-field mt-1" style={field} placeholder="linkedin.com/company/…" value={f.companyUrl} onChange={set("companyUrl")} /></label>
            <label className={label}>Sector<input className="input-field mt-1" style={field} value={f.sector} onChange={set("sector")} /></label>
            <label className={label}>HQ<input className="input-field mt-1" style={field} value={f.hq} onChange={set("hq")} /></label>
            <label className={label}>Raised<input className="input-field mt-1" style={field} placeholder="e.g. $1.2M" value={f.raised} onChange={set("raised")} /></label>
            <label className={label}>Founder name<input className="input-field mt-1" style={field} value={f.founderName} onChange={set("founderName")} /></label>
            <label className={label}>Founder title<input className="input-field mt-1" style={field} placeholder="Co-Founder & CEO" value={f.founderTitle} onChange={set("founderTitle")} /></label>
            <label className={label}>Founder LinkedIn profile<input className="input-field mt-1" style={field} placeholder="linkedin.com/in/…" value={f.founderUrl} onChange={set("founderUrl")} /></label>
          </div>
          <p className="mt-2.5 text-[12px]" style={{ color: "var(--ink-secondary)" }}>
            With a founder&apos;s name and profile link, the extension sends the connection request on its next round. Without one, it looks the founder up itself.
          </p>
          {err && <p className="mt-2 text-[12px]" style={{ color: "#8c1a1a" }}>{err}</p>}
          <div className="mt-3 flex gap-2">
            <button onClick={save} disabled={pending} className="btn-small" style={{ background: "var(--bottomline-green)", color: "var(--paper)", border: "1px solid var(--bottomline-green)", opacity: pending ? 0.6 : 1 }}>
              {pending ? "Saving…" : "Add lead"}
            </button>
            <button onClick={() => { setOpen(false); setErr(null); }} className="btn-small" style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)" }}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}
