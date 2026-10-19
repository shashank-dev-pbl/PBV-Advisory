"use client";

import { unwrap } from "@/lib/actionResult";
import { useState, useTransition } from "react";
import type { Owner } from "@/lib/compliance";
import { saveTeam } from "./actions";

const box = { background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 10 } as const;
const OWNER_LABEL: Record<Owner, string> = { founder: "Founder", practitioner: "External practitioner", pba: "PBA practitioner" };

export default function TeamClient({ canEdit, services, owners }: { canEdit: boolean; services: { service: string; label: string; entries: number }[]; owners: Record<string, Owner> }) {
  const [mine, setMine] = useState<Record<string, Owner>>(owners);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  return (
    <div>
      <p className="mb-4 text-[13px]" style={{ color: "var(--ink-secondary)" }}>
        Who does the work for each service. The person chosen is the default owner of that service&apos;s entries. Until it is set, an entry belongs to the external practitioner. Changing it moves the entries that are still open.
      </p>
      {services.length === 0 && (
        <div className="p-4 text-[13px]" style={box}>No service is being tracked yet. Set one up under Services first, and it will appear here.</div>
      )}
      {services.length > 0 && <div className="overflow-x-auto">
        <table className="w-full" style={{ ...box, borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: "1px solid var(--rule)" }}>
            {["Service", "Entries", "Default owner"].map((h) => <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--ink-secondary)" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.service} style={{ borderBottom: "1px solid var(--rule)" }}>
                <td className="px-3 py-3 text-[13.5px] font-semibold">{s.label}</td>
                <td className="px-3 py-3 text-[13px]">{s.entries}</td>
                <td className="px-3 py-3">
                  <select className="input-field" style={{ maxWidth: 280 }} disabled={!canEdit} value={mine[s.service] ?? "practitioner"} onChange={(e) => setMine({ ...mine, [s.service]: e.target.value as Owner })}>
                    {(Object.keys(OWNER_LABEL) as Owner[]).map((o) => <option key={o} value={o}>{OWNER_LABEL[o]}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
      {err && <p className="mt-3 text-[12.5px]" style={{ color: "#8c1a1a" }}>{err}</p>}
      {msg && <p className="mt-3 text-[12.5px]" style={{ color: "#004d00" }}>{msg}</p>}
      {canEdit && services.length > 0 && (
        <button className="btn-small mt-4" style={{ background: "var(--bottomline-green)", color: "var(--paper)", border: "1px solid var(--bottomline-green)" }} disabled={pending}
          onClick={() => start(async () => {
            setErr(""); setMsg("");
            try {
              const full = Object.fromEntries(services.map((s) => [s.service, mine[s.service] ?? "practitioner"])) as Record<string, Owner>;
              const { moved } = unwrap(await saveTeam(full));
              setMsg(`Saved. ${moved} open ${moved === 1 ? "entry" : "entries"} moved to the new owner.`);
            } catch (e) { setErr(e instanceof Error ? e.message : "Could not save"); }
          })}>{pending ? "Saving…" : "Save team"}</button>
      )}
    </div>
  );
}
