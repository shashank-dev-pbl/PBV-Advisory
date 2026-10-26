import { pageGate } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";
import { externalFirmName } from "@/lib/firm";
import { buildPlan, booksOwner, currentFyStart, filingsForPeriod, type EngineData } from "@/lib/master/engine";
import { monthView, ymAdd, ymOf, tickKey, misKey } from "@/lib/close/state";
import { aggregate, figFromRow, periodsAvailable, type Fig } from "@/lib/dashboard/model";
import { buildAttention } from "@/lib/dashboard/attention";
import PageHeader from "../PageHeader";
import Locked from "../Locked";
import NoCompany from "../NoCompany";
import SettingUp from "../SettingUp";
import DashboardView, { type FilingLine, type FilingStat } from "./DashboardView";
import type { Answers } from "@/lib/master/types";

const money = (n: unknown) => (typeof n === "string" || typeof n === "number" ? `₹${Number(String(n).replace(/\D/g, "")).toLocaleString("en-IN")}` : "");
const dfmt = (iso?: string) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "no date");

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { session, locked } = await pageGate("dashboard");
  if (locked) return <Locked page="dashboard" who={session.who!} />;
  const company = session.company;
  if (!company) return <NoCompany page="dashboard" admin={session.who === "admin"} />;
  if (company.status === "setting_up") return <SettingUp page="dashboard" name={company.name} />;
  const { m } = await searchParams;

  const supabase = await createClient();
  const [master, rules, filings, eventDocs, library, files, months, published, co, firm, legalRows] = await Promise.all([
    supabase.from("company_master").select("answers").eq("company_id", company.id).maybeSingle(),
    supabase.from("master_rule").select("*").eq("active", true).order("sort"),
    supabase.from("master_filing").select("*").eq("active", true).order("sort"),
    supabase.from("event_type_doc").select("event_type, doc_code, need, condition_note"),
    supabase.from("doc_library").select("code, name, form"),
    supabase.from("file_version").select("req_key, period").eq("company_id", company.id).eq("removed", false).not("period", "is", null),
    supabase.from("month").select("period, submitted_at, published_at").eq("company_id", company.id),
    supabase.from("period_figures").select("*").eq("company_id", company.id).eq("state", "published").order("version", { ascending: false }),
    supabase.from("company").select("tracking_start").eq("id", company.id).maybeSingle(),
    externalFirmName(supabase, company.id),
    session.who === "external" ? Promise.resolve({ data: [] as { id: string; title: string; status: string; quote_amount: number | null }[] }) : supabase.from("legal_request").select("id, title, status, quote_amount").eq("company_id", company.id).in("status", ["pay", "extra"]),
  ]);
  const legalExtras = await supabase.from("legal_extra").select("request_id, amount").eq("status", "proposed").in("request_id", (legalRows.data ?? []).map((r) => r.id));
  const err = master.error ?? rules.error ?? filings.error ?? files.error ?? months.error ?? published.error;
  if (err) {
    return (<><PageHeader title={company.name} accent="Dashboard" /><div className="mx-auto max-w-[1280px] px-5 py-8 md:px-8"><div className="p-4 text-[13px]" style={{ background: "#fbe9e7", border: "1px solid #e3b8b2", color: "#8c1a1a" }}>The dashboard could not load: {err.message}</div></div></>);
  }
  const answers = (master.data?.answers ?? {}) as Answers;
  const today = new Date();
  const plan = buildPlan(answers, { rules: rules.data ?? [], filings: filings.data ?? [], eventDocs: eventDocs.data ?? [], library: library.data ?? [] } as EngineData, today);
  const have = new Set((files.data ?? []).map((f) => `${f.req_key}|${f.period}`));
  const has = (k: string, period: string) => have.has(`${k}|${period}`);
  const inc = answers.incorporatedOn?.slice(0, 7), fy = currentFyStart(today);
  const trackFrom = co.data?.tracking_start ?? answers.trackingStart ?? (inc && inc > fy ? inc : fy);

  // Published months only — the founder never sees a month before it is published. The newest published version of each month.
  const seen = new Set<string>(); const figs: Record<string, Fig> = {}; const reopened: string[] = [];
  for (const r of published.data ?? []) { if (seen.has(r.period as string)) continue; seen.add(r.period as string); figs[r.period as string] = figFromRow(r as Record<string, number | null | string>); if (r.query_text) reopened.push(r.period as string); }

  const fStat: Record<string, FilingStat> = {}; const lines: FilingLine[] = []; const docs: { ym: string; items: string[] }[] = [];
  for (const ym of Object.keys(figs)) {
    const fl = filingsForPeriod(plan, ym);
    fStat[ym] = { total: fl.reduce((n, f) => n + f.ticks.length, 0), done: fl.reduce((n, f) => n + f.ticks.filter((t) => has(tickKey(f.key, t), ym)).length, 0) };
    for (const f of fl) lines.push({ ym, name: f.name, due: f.due, done: f.ticks.every((t) => has(tickKey(f.key, t), ym)) });
    const v = monthView({ ym, today, trackFrom, plan, has, submitted: false, published: true });
    docs.push({ ym, items: [...(has(misKey, ym) ? ["MIS workbook"] : []), ...v.books.filter((b) => has(b.key, ym)).map((b) => b.name)] });
  }
  const keys = periodsAvailable("month", figs); const latestYm = keys[keys.length - 1];
  const latest = latestYm ? aggregate("month", latestYm, figs, fStat) : null;
  const closer = booksOwner(answers);
  const closerLabel = closer === "founder" ? "the founder" : closer === "pba" ? "Prime Bottomline" : answers.books?.firmName || firm || "the external practitioner";
  const pubSet = new Map((months.data ?? []).map((x) => [x.period as string, x]));
  const attention = buildAttention({ today, trackFrom, plan, has, latest, closerLabel, closer, forFounder: session.who === "founder", legal: (legalRows.data ?? []).map((r) => ({ id: r.id, title: r.title, status: r.status as "pay" | "extra", owed: r.status === "extra" ? (legalExtras.data ?? []).filter((x) => x.request_id === r.id).reduce((n, x) => n + Number(x.amount), 0) : Number(r.quote_amount ?? 0) })), submittedOrPublished: (ym) => !!pubSet.get(ym)?.submitted_at });
  // months that have ended but are not published yet — hidden from the founder
  const preparing: string[] = [];
  for (let ym = latestYm ? ymAdd(latestYm, 1) : trackFrom; ym < ymOf(today); ym = ymAdd(ym, 1)) if (!figs[ym] && ym >= trackFrom) preparing.push(ym);

  const snapshot = {
    rounds: (answers.rounds ?? []).filter((r) => r.round).map((r) => `${r.round} — ${r.instrument?.toUpperCase()}, ${money(r.amount)}, ${dfmt(r.closedOn)}`),
    debs: (answers.debentures ?? []).filter((d) => d.issuedOn).map((d) => `${d.type?.replace(/_/g, " ")} — ${money(d.amount)}, ${dfmt(d.issuedOn)}${d.status === "redeemed" ? " · repaid" : ""}`),
    loans: (answers.loans ?? []).filter((l) => l.lender).map((l) => `${l.lender} — ${l.type}${l.sanctioned ? `, ${money(l.sanctioned)}` : ""}`),
    holds: (answers.investments ?? []).filter((i) => i.what).map((i) => `${i.what.replace(/_/g, " ")}${i.heldWith ? ` with ${i.heldWith}` : ""}${i.amount ? ` — ${money(i.amount)}` : ""}`),
  };
  return (
    <>
      <PageHeader title={company.name} accent="Dashboard" />
      <DashboardView
        figs={figs} filings={fStat} filingLines={lines} attention={attention} preparing={preparing} reopened={reopened}
        isPBA={session.who === "pba" || session.who === "admin"} firmName={answers.books?.firmName || firm}
        snapshot={snapshot} docs={docs} todayLabel={today.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} hasMaster={!!answers.incorporatedOn} initial={m}
      />
    </>
  );
}
