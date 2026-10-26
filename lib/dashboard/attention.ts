// "Needs your attention" (spec 08): live as of today, red first, then amber. Built from the monthly close and the latest published month.
import { DUE_DAY } from "@/lib/master/engine";
import { dueOn, monthView, ymOf, type MonthView } from "@/lib/close/state";
import { L, pct, ymAdd, ymLabel, type Agg } from "@/lib/dashboard/model";
import type { Owner, Plan } from "@/lib/master/types";
import type { AttItem } from "@/app/(portal)/dashboard/DashboardView";

const dshort = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const clean = (n: string) => n.replace(/ — .*/, "");

export function buildAttention(p: {
  today: Date; trackFrom: string; plan: Plan; has: (k: string, period: string) => boolean; latest: Agg | null; submittedOrPublished: (ym: string) => boolean;
  closerLabel: string; closer: Owner; legal?: { id: string; title: string; status: "pay" | "extra"; owed: number }[]; forFounder?: boolean;
}): AttItem[] {
  const out: AttItem[] = [];
  const iso = `${p.today.getFullYear()}-${String(p.today.getMonth() + 1).padStart(2, "0")}-${String(p.today.getDate()).padStart(2, "0")}`;
  const a = p.latest;
  if (a && a.runway != null && a.runway < 4) out.push({ lv: "red", title: `Runway is **${a.runway.toFixed(1)} months** — below the 4-month line`, detail: `At ${L(a.avgBurn)} a month of net burn, free cash of ${L(a.cash - a.restricted)} lasts until about ${ymLabel(ymAdd(a.lastYm, Math.floor(a.runway)), true)}.` });

  const views: { ym: string; v: MonthView }[] = [];
  for (let ym = p.trackFrom; ym < ymOf(p.today); ym = ymAdd(ym, 1)) {
    const v = monthView({ ym, today: p.today, trackFrom: p.trackFrom, plan: p.plan, has: p.has, submitted: p.submittedOrPublished(ym), published: false });
    views.push({ ym, v });
  }
  for (const { ym, v } of views.filter((x) => x.v.state === "late")) {
    const mine = v.docs.filter((d) => d.tier === "mandatory" && !p.has(d.key, ym) && d.owner === "founder").map((d) => clean(d.name));
    const others = [...v.docs.filter((d) => d.tier === "mandatory" && !p.has(d.key, ym) && d.owner !== "founder"), ...v.books.filter((b) => !p.has(b.key, ym))].map((d) => clean(d.name));
    if (!v.mis) others.push("MIS workbook");
    const lf = v.filings.filter((f) => iso > f.due && !f.ticks.every((t) => p.has(`F:${f.key}:${t}`, ym))).map((f) => clean(f.name));
    if (mine.length) out.push({ lv: "red", title: `${ymLabel(ym, true)} is late — **${mine.length} document${mine.length > 1 ? "s" : ""} from you**`, detail: `${mine.join(", ")}. Due ${dshort(dueOn(ym, DUE_DAY.from_company))}. The ${ymLabel(ym, true)} figures can't reach this page until they're in.`, act: { label: "Upload now", href: `/monthly?m=${ym}` } });
    if (others.length || lf.length) out.push({ lv: "amber", title: `${ymLabel(ym, true)} — waiting on ${p.closerLabel}`, detail: `${[...others, ...lf.map((x) => `${x} (late)`)].join(", ")}.`, act: { label: "See the month", href: `/monthly?m=${ym}` } });
  }
  // filings due in the next 30 days that are not done
  const soon: { name: string; ym: string; due: string; days: number; part: boolean }[] = [];
  for (const { ym, v } of views.concat([{ ym: ymOf(p.today), v: monthView({ ym: ymOf(p.today), today: p.today, trackFrom: p.trackFrom, plan: p.plan, has: p.has, submitted: false, published: false }) }])) {
    for (const f of v.filings) {
      const done = f.ticks.every((t) => p.has(`F:${f.key}:${t}`, ym));
      const days = (new Date(`${f.due}T00:00:00`).getTime() - new Date(`${iso}T00:00:00`).getTime()) / 864e5;
      if (!done && days >= 0 && days <= 30) soon.push({ name: clean(f.name), ym, due: f.due, days, part: f.ticks.some((t) => p.has(`F:${f.key}:${t}`, ym)) });
    }
  }
  soon.sort((x, y) => x.days - y.days);
  if (soon.length) out.push({ lv: soon[0].days <= 3 ? "amber" : "grey", title: `${soon.length} filing${soon.length > 1 ? "s" : ""} due in the next 30 days — next is **${soon[0].name}** on ${dshort(soon[0].due)}`, detail: soon.map((s) => `${s.name} (${ymLabel(s.ym)}) · ${dshort(s.due)}${s.part ? " · paid, not filed" : ""}`).join("\n"), act: { label: "Filings", href: "/monthly" } });

  if (a && a.topShare > 0.4) out.push({ lv: "amber", title: `One client is **${pct(a.topShare)} of revenue**`, detail: `In ${ymLabel(a.lastYm, true)}. The top five clients are ${pct(a.top5Share)}. Losing the largest would take out ${L(a.top)} a month.` });
  if (a && a.r90 > 0) out.push({ lv: "amber", title: `**${L(a.r90)}** owed to you for more than 90 days`, detail: `Out of ${L(a.rec)} owed in total at the end of ${ymLabel(a.lastYm, true)}. Money this old is the least likely to arrive.` });
  if (a && a.collLow2) out.push({ lv: "amber", title: "Collected under 80% of billing for two months running", detail: `${ymLabel(ymAdd(a.lastYm, -1))} and ${ymLabel(a.lastYm)}.` });
  if (a && a.notices && a.notices > 0) out.push({ lv: "red", title: `${a.notices} open government notice${a.notices > 1 ? "s" : ""}` });
  const lw = p.legal ?? [];
  if (lw.length) out.push({ lv: "red", title: `${lw.length} legal request${lw.length > 1 ? "s" : ""} waiting on ${p.forFounder ? "you" : "the founder"}`,
    detail: lw.map((r) => (r.status === "pay" ? `${r.title} — pay ₹${Math.round(r.owed * 1.18).toLocaleString("en-IN")} to start` : `${r.title} — ready; approve ₹${Math.round(r.owed * 1.18).toLocaleString("en-IN")} of extra work to receive it`)).join("\n"),
    act: { label: "Open Legal", href: `/legal?r=${lw[0].id}` } });
  const ord = { red: 0, amber: 1, grey: 2 } as const;
  return out.sort((x, y) => ord[x.lv] - ord[y.lv]);
}
