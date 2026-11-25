"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addLead } from "./actions";

const blank = { company: "", website: "", sector: "", hq: "", companyUrl: "", round: "", amount: "", leadInvestor: "", description: "", founderName: "", founderTitle: "", founderUrl: "" };

// "+ Add lead": put a company on the list by hand. It skips verification and waits in "Verified – to approve".
export default function AddLead() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [f, setF] = useState(blank);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = () => {
    setErr(null);
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
      <button className="btn pri" onClick={() => setOpen((v) => !v)}>+ Add lead</button>
      {open && (
        <div className="card" style={{ flexBasis: "100%", marginTop: 4 }}>
          <h3>Add a lead by hand</h3>
          <div className="form" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            <div className="field"><label>Company name *</label><input value={f.company} onChange={set("company")} /></div>
            <div className="field"><label>Website</label><input placeholder="https://…" value={f.website} onChange={set("website")} /></div>
            <div className="field"><label>Company LinkedIn page</label><input placeholder="linkedin.com/company/…" value={f.companyUrl} onChange={set("companyUrl")} /></div>
            <div className="field"><label>Round</label><input list="ob-rounds" placeholder="Seed, Series A…" value={f.round} onChange={set("round")} />
              <datalist id="ob-rounds">{["Pre-seed", "Seed", "Pre-Series A", "Series A", "Series B"].map((r) => <option key={r} value={r} />)}</datalist></div>
            <div className="field"><label>Amount</label><input placeholder="₹9 Cr or $3.2M" value={f.amount} onChange={set("amount")} /></div>
            <div className="field"><label>Lead investor</label><input value={f.leadInvestor} onChange={set("leadInvestor")} /></div>
            <div className="field"><label>Sector</label><input value={f.sector} onChange={set("sector")} /></div>
            <div className="field"><label>City</label><input value={f.hq} onChange={set("hq")} /></div>
            <div className="field"><label>What they do</label><input value={f.description} onChange={set("description")} /></div>
            <div className="field"><label>Founder name</label><input value={f.founderName} onChange={set("founderName")} /></div>
            <div className="field"><label>Founder title</label><input placeholder="Co-Founder & CEO" value={f.founderTitle} onChange={set("founderTitle")} /></div>
            <div className="field"><label>Founder LinkedIn profile</label><input placeholder="linkedin.com/in/…" value={f.founderUrl} onChange={set("founderUrl")} /></div>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: "10px 0 0" }}>
            Round, amount and lead investor fill the messages (&ldquo;congratulations on the {"{{round}}"}&rdquo;), so add them. A hand-added lead skips verification and waits in
            &ldquo;Verified – to approve&rdquo;. With a founder&apos;s name and link the extension has nothing to look up; without one it finds the founder first.
          </p>
          {err && <p className="err">{err}</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn pri" onClick={save} disabled={pending}>{pending ? "Saving…" : "Add lead"}</button>
            <button className="btn" onClick={() => { setOpen(false); setErr(null); }}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}
