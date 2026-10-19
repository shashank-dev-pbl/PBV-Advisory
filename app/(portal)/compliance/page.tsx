import Link from "next/link";
import { pageGate } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";
import { isOverdue } from "@/lib/compliance";
import PageHeader from "../PageHeader";
import Locked from "../Locked";
import NoCompany from "../NoCompany";
import SettingUp from "../SettingUp";

type Ob = {
  id: string; name: string; category: string; fy: string; period: string; statutory_due_date: string; due_override: string | null;
  status: "pending" | "filed" | "verified"; rule_code: string | null; registration_id: string | null; closed_reason: string | null;
};

const SERVICES = ["GST", "TDS", "ITR"] as const;
const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
const box = { background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 10 } as const;
const dueOf = (o: Ob) => o.due_override ?? o.statutory_due_date;
const short = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const daysBetween = (a: string, b: string) => Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000);

export default async function CompliancePage({ searchParams }: { searchParams: Promise<{ s?: string; fy?: string }> }) {
  const { session, locked } = await pageGate("compliance");
  if (locked) return <Locked page="compliance" who={session.who!} />;
  const company = session.company;
  if (!company) return <NoCompany page="compliance" admin={session.who === "admin"} />;
  if (company.status === "setting_up") return <SettingUp page="compliance" name={company.name} />;

  const sp = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("obligation")
    .select("id, name, category, fy, period, statutory_due_date, due_override, status, rule_code, registration_id, closed_reason")
    .eq("company_id", company.id)
    .order("statutory_due_date");
  if (error) {
    return (
      <>
        <PageHeader title={company.name} accent="Compliance" />
        <div className="mx-auto w-full max-w-[1280px] px-5 py-8 md:px-8">
          <div className="p-4 text-[13px]" style={{ background: "#fbe9e7", border: "1px solid #e3b8b2", color: "#8c1a1a" }}>This page could not load: {error.message}</div>
        </div>
      </>
    );
  }

  const all = (data ?? []) as Ob[];
  const open = all.filter((o) => !o.closed_reason);
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(new Date(today).getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const overdue = (o: Ob) => isOverdue({ status: o.status, statutory_due_date: o.statutory_due_date, due_override: o.due_override, closed_reason: o.closed_reason }, today);

  const fyNow = new Date().getUTCMonth() >= 3 ? new Date().getUTCFullYear() : new Date().getUTCFullYear() - 1;
  const fy = Number(sp.fy) || fyNow;
  const fyLabel = `FY${String(fy + 1).slice(-2)}`;
  const service = (SERVICES as readonly string[]).includes(sp.s ?? "") ? (sp.s as string) : "Summary";

  const tabLink = (s: string) => `/compliance?s=${s}&fy=${fy}`;
  const generated = all.filter((o) => o.rule_code);

  const stat = (label: string, value: number, bad = false) => (
    <div className="p-4" style={box}>
      <p className="text-[12px]" style={{ color: "var(--ink-secondary)" }}>{label}</p>
      <p className="tnum text-[26px] font-bold" style={{ color: bad && value > 0 ? "#8c1a1a" : "var(--ink)" }}>{value}</p>
    </div>
  );

  return (
    <>
      <PageHeader title={company.name} accent="Compliance" sub="Built from the registrations confirmed under Master documents" />
      <div className="mx-auto w-full max-w-[1280px] px-5 py-8 md:px-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b" style={{ borderColor: "var(--rule)" }}>
          <div className="flex gap-1">
            {["Summary", ...SERVICES].map((s) => (
              <Link key={s} href={tabLink(s)} className="px-3.5 py-2.5 text-[13.5px]"
                style={{ borderBottom: `2px solid ${service === s ? "var(--bottomline-green)" : "transparent"}`, color: service === s ? "var(--bottomline-green)" : "var(--ink-secondary)", fontWeight: service === s ? 700 : 500, marginBottom: -1 }}>
                {s}
              </Link>
            ))}
          </div>
          <div className="mb-2 flex items-center gap-2 text-[12.5px]">
            <Link href={`/compliance?s=${service}&fy=${fy - 1}`} className="btn-small" style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)" }}>←</Link>
            <b>FY {fy}-{String(fy + 1).slice(-2)}</b>
            <Link href={`/compliance?s=${service}&fy=${fy + 1}`} className="btn-small" style={{ background: "transparent", border: "1px solid var(--rule)", color: "var(--ink-secondary)" }}>→</Link>
          </div>
        </div>

        {generated.length === 0 && (
          <div className="mb-5 p-4 text-[13px]" style={box}>
            Nothing is tracked yet. Upload a GST certificate, TAN letter or certificate of incorporation under{" "}
            <Link href="/master/once" className="font-semibold underline">Master</Link> and confirm its details to build the calendar.
          </div>
        )}

        {service === "Summary" ? (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3.5 md:grid-cols-4">
              {stat("Overdue", open.filter(overdue).length, true)}
              {stat("Due in the next 30 days", open.filter((o) => o.status === "pending" && dueOf(o) >= today && dueOf(o) <= in30).length)}
              {stat("Filed, waiting for PBA", open.filter((o) => o.status === "filed").length)}
              {stat(`Verified in ${fyLabel}`, open.filter((o) => o.status === "verified" && o.fy === fyLabel).length)}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full" style={{ ...box, borderCollapse: "collapse" }}>
                <thead><tr style={{ borderBottom: "1px solid var(--rule)" }}>
                  {["Service", "Overdue", "Due in 30 days", "Filed", "Verified", "Open total"].map((h) => <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--ink-secondary)" }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {[...SERVICES, "Other"].map((s) => {
                    const rows = open.filter((o) => (s === "Other" ? !(SERVICES as readonly string[]).includes(o.category) : o.category === s));
                    if (s === "Other" && rows.length === 0) return null;
                    return (
                      <tr key={s} style={{ borderBottom: "1px solid var(--rule)" }}>
                        <td className="px-3 py-2.5 text-[13.5px] font-semibold">{s === "Other" ? "Other filings" : <Link href={tabLink(s)} className="underline">{s}</Link>}</td>
                        <td className="px-3 py-2.5 text-[13px]" style={{ color: rows.filter(overdue).length ? "#8c1a1a" : undefined, fontWeight: 600 }}>{rows.filter(overdue).length}</td>
                        <td className="px-3 py-2.5 text-[13px]">{rows.filter((o) => o.status === "pending" && dueOf(o) >= today && dueOf(o) <= in30).length}</td>
                        <td className="px-3 py-2.5 text-[13px]">{rows.filter((o) => o.status === "filed").length}</td>
                        <td className="px-3 py-2.5 text-[13px]">{rows.filter((o) => o.status === "verified").length}</td>
                        <td className="px-3 py-2.5 text-[13px]">{rows.length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[12px]" style={{ color: "var(--ink-secondary)" }}>Overdue is worked out from each due date against today. Closed entries (registrations that stopped) are not counted.</p>
          </>
        ) : (
          <Matrix rows={generated.filter((o) => o.category === service && o.fy === fyLabel)} today={today} overdue={overdue} />
        )}
        <p className="mt-6 text-[12px]" style={{ color: "var(--ink-secondary)" }}>Mark a filing as filed, with its proof, on the <Link href="/filings" className="underline">Filings</Link> page. PBA verifies each one.</p>
      </div>
    </>
  );
}

function Matrix({ rows, today, overdue }: { rows: Ob[]; today: string; overdue: (o: Ob) => boolean }) {
  if (rows.length === 0) return <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>No entries for this financial year.</p>;
  // One line per rule and registration; the label is the entry's name without its period.
  const lines = new Map<string, { label: string; cells: Map<number, Ob> }>();
  for (const o of rows) {
    const key = `${o.rule_code}|${o.registration_id}`;
    const line = lines.get(key) ?? { label: o.name.split(" · ").slice(0, -1).join(" · "), cells: new Map() };
    const m = Number(o.period.slice(5, 7)); // 1-12
    line.cells.set((m + 8) % 12, o);        // April -> column 0
    lines.set(key, line);
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full" style={{ ...box, borderCollapse: "collapse", minWidth: 900 }}>
        <thead><tr style={{ borderBottom: "1px solid var(--rule)" }}>
          <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--ink-secondary)" }}>Filing</th>
          {MONTHS.map((m) => <th key={m} className="px-2 py-2 text-center text-[11px] font-semibold uppercase" style={{ color: "var(--ink-secondary)" }}>{m}</th>)}
        </tr></thead>
        <tbody>
          {[...lines.values()].map((l) => (
            <tr key={l.label} style={{ borderBottom: "1px solid var(--rule)" }}>
              <td className="px-3 py-2 text-[12.5px] font-semibold">{l.label}</td>
              {MONTHS.map((_, i) => {
                const o = l.cells.get(i);
                if (!o) return <td key={i} className="px-2 py-2 text-center text-[11px]" style={{ color: "var(--rule)" }}>·</td>;
                if (o.closed_reason) return <td key={i} className="px-2 py-2 text-center text-[11px]" style={{ color: "var(--ink-secondary)" }} title={o.closed_reason}>closed</td>;
                const late = overdue(o);
                const due = o.due_override ?? o.statutory_due_date;
                const style = o.status === "verified" ? { background: "#004d00", color: "#fff" }
                  : o.status === "filed" ? { background: "#e4ece0", color: "#004d00" }
                  : late ? { background: "#fbe9e7", color: "#8c1a1a" } : { background: "#f1ece0", color: "#6b6357" };
                const text = o.status === "verified" ? "✓" : o.status === "filed" ? "filed" : late ? `${daysBetween(today, due)}d late` : short(due);
                return (
                  <td key={i} className="px-1 py-1.5 text-center">
                    <span className="inline-block px-1.5 py-0.5 text-[10.5px] font-semibold" style={{ borderRadius: 5, ...style }} title={`${o.name} — due ${short(due)}`}>{text}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11.5px]" style={{ color: "var(--ink-secondary)" }}>Quarterly and yearly returns sit in the last month of their period. ✓ verified by PBA · filed = waiting for PBA · grey = due date.</p>
    </div>
  );
}
