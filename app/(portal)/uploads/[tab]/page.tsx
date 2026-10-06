import Link from "next/link";
import { notFound } from "next/navigation";
import { pageGate } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";
import { closePeriod, formatPeriodLabel, monthlyDueDate } from "@/lib/period";
import { isDone, rowKey, shortDate } from "@/lib/uploads";
import type { PageKey } from "@/lib/access";
import PageHeader from "../../PageHeader";
import Locked from "../../Locked";
import NoCompany from "../../NoCompany";
import SettingUp from "../../SettingUp";
import UploadsBoard from "./UploadsBoard";
import RevenueInfoBanner from "./RevenueInfoBanner";
import type { Company, DocItem } from "@/lib/types";

const TABS = {
  once: { key: "up-once" as PageKey, label: "One-time", cadence: "once", blurb: "Things we need once. Update them only if something changes." },
  month: { key: "up-month" as PageKey, label: "Monthly", cadence: "monthly", blurb: "" },
  qy: { key: "up-qy" as PageKey, label: "Quarterly & yearly", cadence: "qy", blurb: "Quarterly returns, year-end items, and notices whenever one arrives." },
} as const;
type TabKey = keyof typeof TABS;

export default async function UploadsPage({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  if (!(tab in TABS)) notFound();
  const t = TABS[tab as TabKey];

  const { session, locked } = await pageGate(t.key);
  if (locked) return <Locked page={t.key} who={session.who!} />;
  const company = session.company;
  const user = session.user!;
  if (!company) return <NoCompany page={t.key} admin={session.who === "admin"} />;
  if (company.status === "setting_up") return <SettingUp page={t.key} name={company.name} />;

  const supabase = await createClient();
  const period = closePeriod();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: companyRow }, { data }] = await Promise.all([
    supabase.from("company").select("*").eq("id", company.id).single<Company>(),
    supabase
      .from("doc_item")
      .select("*, doc_file(*), doc_item_message(*)")
      .eq("company_id", company.id)
      .in("period", ["ONCE", period])
      .order("requested_at", { ascending: true }),
  ]);
  const all = (data ?? []) as DocItem[];
  const items = all.filter((i) => i.cadence === t.cadence);

  // How many are still open in each tab — shown on the tab itself.
  const openCount = (cadence: string) => all.filter((i) => i.cadence === cadence && !isDone(rowKey(i, today))).length;

  // Names for "Accepted by …" — whoever made a decision on these items.
  const ids = [...new Set(all.flatMap((i) => [i.accepted_by, i.na_by]).filter((x): x is string => !!x))];
  const names: Record<string, string> = {};
  if (ids.length > 0) {
    const { data: people } = await supabase.from("app_user").select("id, name").in("id", ids);
    for (const p of people ?? []) if (p.name) names[p.id] = p.name;
  }

  const sub = tab === "month" ? `${formatPeriodLabel(period)} · due by ${shortDate(monthlyDueDate(period, 3))}` : t.blurb;
  const needsRevenueInfo = session.who === "founder" && companyRow && (!companyRow.revenue_classification || !companyRow.gross_net_billing);

  return (
    <>
      <PageHeader title={company.name} accent={`Uploads · ${t.label}`} sub={sub} />
      <div className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8">
        <div className="mb-5 flex gap-1 border-b" style={{ borderColor: "var(--rule)" }}>
          {(Object.keys(TABS) as TabKey[]).map((k) => {
            const n = openCount(TABS[k].cadence);
            const on = k === tab;
            return (
              <Link
                key={k}
                href={`/uploads/${k}`}
                className="px-3.5 py-2.5 text-[13.5px]"
                style={{ borderBottom: `2px solid ${on ? "var(--bottomline-green)" : "transparent"}`, color: on ? "var(--bottomline-green)" : "var(--ink-secondary)", fontWeight: on ? 700 : 500, marginBottom: -1 }}
              >
                {TABS[k].label}
                <small className="ml-1.5 text-[11px]" style={n ? { background: "#fdf3dd", color: "#8a6412", borderRadius: 10, padding: "1px 7px", fontWeight: 600 } : { color: "var(--ink-secondary)", fontWeight: 400 }}>
                  {n ? `${n} open` : "done"}
                </small>
              </Link>
            );
          })}
        </div>

        {session.who === "external" && (
          <div className="mb-5 p-3.5 text-[13px]" style={{ background: "#e9eef5", border: "1px solid #cdd9e8", color: "#26527f" }}>
            You can see everything the founder uploads and upload on their behalf. Accepting items is for Prime Bottomline.
          </div>
        )}
        {(session.who === "pba" || session.who === "admin") && (
          <div className="mb-5 p-3.5 text-[13px]" style={{ background: "#eef3ec", border: "1px solid #cfdccd", color: "#22452a" }}>
            Accept what&apos;s usable. Ask a question on anything that isn&apos;t — the item stays open until the founder replies.
          </div>
        )}
        {needsRevenueInfo && companyRow && (
          <RevenueInfoBanner
            companyId={company.id}
            revenueClassification={companyRow.revenue_classification ?? ""}
            grossNetBilling={companyRow.gross_net_billing ?? ""}
          />
        )}

        <UploadsBoard key={`${company.id}-${tab}`} items={items} who={session.who!} companyId={company.id} userId={user.id} today={today} names={names} />
      </div>
    </>
  );
}
