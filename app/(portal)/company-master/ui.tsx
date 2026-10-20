"use client";

import { useState } from "react";
import type { Owner } from "@/lib/master/types";

// Small pieces shared by the master and (later) monthly close, in the prototype's markup so its stylesheet applies.

export function Own({ owner, label }: { owner: Owner; label: string }) {
  return <span className={`own ${owner === "founder" ? "f" : owner === "external" ? "e" : "p"}`}><i />{label}</span>;
}

export type ModalState = { title: string; body: React.ReactNode; reason?: boolean; danger?: boolean; confirm: string; onOk: (reason: string) => void };

export function Modal({ m, onClose }: { m: ModalState; onClose: () => void }) {
  const [reason, setReason] = useState("");
  return (
    <div className="mback" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={m.title}>
        <div className="mt">{m.title}</div>
        <div className="mb">{m.body}</div>
        {m.reason && (
          <>
            <label className="ml">Why? <span>(shown in the history)</span></label>
            <input className="minp" autoFocus placeholder="e.g. corrected scan, altered after the round" value={reason} onChange={(e) => setReason(e.target.value)} />
          </>
        )}
        <div className="macts">
          <button className="b quiet" onClick={onClose}>Cancel</button>
          <button className={`b solid ${m.danger ? "danger" : ""}`} onClick={() => m.onOk(reason)}>{m.confirm}</button>
        </div>
      </div>
    </div>
  );
}

export function Expander({ title, open: initial, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!initial);
  return (
    <div className={`xp ${open ? "o" : ""}`}>
      <button className="xph" onClick={() => setOpen(!open)}><span className="chev">›</span>{title}</button>
      {open && <div className="xpb">{children}</div>}
    </div>
  );
}
