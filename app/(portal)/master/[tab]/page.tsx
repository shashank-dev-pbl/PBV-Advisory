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
import { CustomTab, ServicesTab, TeamTab } from "../tabs";
import type { Company, DocItem } from "@/lib/types";

// The first three are the CXO Lens Master pages (what compliances apply, who does the work, your own types);
// the last three are the document checklists. All share the up-once gate: every role can open them.
const TABS = {
  services: { key: "up-once" as PageKey, label: "Services", cadence: "", special: true, blurb: "Switch on what applies to you. Saving builds the compliance calendar." },
  team: { key: "up-once" as PageKey, label: "Team", cadence: "", special: true, blurb: "Who does the work for each service." },
  custom: { key: "up-once" as PageKey, label: "Custom types", cadence: "", special: true, blurb: "Your own items, such as a Fire NOC or an FSSAI renewal." },
  once: { key: "up-once" as PageKey, label: "One-time", cadence: "once", special: false, blurb: "Things we need once. Update them only if something changes." },
  month: { key: "up-month" as PageKey, label: "Monthly", cadence: "monthly", special: false, blurb: "" },
  qy: { key: "up-qy" as PageKey, label: "Quarterly & yearly", cadence: "qy", special: false, blurb: "Quarterly returns, year-end items, and notices whenever one arrives." },
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

  const sub = t.special ? t.blurb : tab === "month" ? `${formatPeriodLabel(period)} · due by ${shortDate(monthlyDueDate(period, 3))}` : t.blurb;
  const needsRevenueInfo = session.who === "founder" && companyRow && (!companyRow.revenue_classification || !companyRow.gross_net_billing);

  return (
    <>
      <PageHeader title={company.name} accent={`Master · ${t.label}`} sub={sub} />
      <div className="mx-auto w-full max-w-[1280px] px-5 py-8 md:px-8">
        <div className="mb-5 flex gap-1 border-b" style={{ borderColor: "var(--rule)" }}>
          {(Object.keys(TABS) as TabKey[]).map((k) => {
            const n = TABS[k].special ? 0 : openCount(TABS[k].cadence);
            const on = k === tab;
            return (
              <Link
                key={k}
                href={`/master/${k}`}
                className="px-3.5 py-2.5 text-[13.5px]"
                style={{ borderBottom: `2px solid ${on ? "var(--bottomline-green)" : "transparent"}`, color: on ? "var(--bottomline-green)" : "var(--ink-secondary)", fontWeight: on ? 700 : 500, marginBottom: -1 }}
              >
                {TABS[k].label}
                {!TABS[k].special && <small className="ml-1.5 text-[11px]" style={n ? { background: "#fdf3dd", color: "#8a6412", borderRadius: 10, padding: "1px 7px", fontWeight: 600 } : { color: "var(--ink-secondary)", fontWeight: 400 }}>
                  {n ? `${n} open` : "done"}
                </small>}
              </Link>
            );
          })}
        </div>

        {tab === "services" && <ServicesTab companyId={company.id} canEdit={session.who !== "founder"} />}
        {tab === "team" && <TeamTab companyId={company.id} canEdit={session.who !== "founder"} />}
        {tab === "custom" && <CustomTab companyId={company.id} canEdit={session.who !== "founder"} />}
        {!t.special && (
          <>
        {session.who === "external" && (
          <div className="mb-5 p-3.5 text-[13px]" style={{ background: "#e9eef5", border: "1px solid #cdd9e8", color: "#26527f" }}>
            You can see everything the founder uploads and upload on their behalf. Accepting items is for Prime Bottomline.
          </div>
        )}
        {(session.who === "pba" || session.who === "admin") && (
          <div className="mb-5 p-3.5 text-[13px]" style={{ background: "#eef3ec", border: "1px solid #cfdccd", color: "#004d00" }}>
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
          </>
        )}
      </div>
    </>
  );
}
