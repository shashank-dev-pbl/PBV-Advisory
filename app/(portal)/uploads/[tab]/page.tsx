import Link from "next/link";
import { notFound } from "next/navigation";
import { pageGate } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";
import { currentPeriod, formatPeriodLabel } from "@/lib/period";
import type { PageKey } from "@/lib/access";
import FounderView from "@/app/founder/FounderView";
import UploadsReview from "@/app/practitioner/UploadsReview";
import PageHeader from "../../PageHeader";
import Locked from "../../Locked";
import NoCompany from "../../NoCompany";
import type { Company, DocItem } from "@/lib/types";

const TABS = {
  once: { key: "up-once" as PageKey, label: "One-time", blurb: "Collected at onboarding. Updated only if something changes." },
  month: { key: "up-month" as PageKey, label: "Monthly", blurb: "Every month, due by the 3rd." },
  qy: { key: "up-qy" as PageKey, label: "Quarterly & yearly", blurb: "Quarterly returns, year-end items, and notices whenever one arrives." },
} as const;

export default async function UploadsPage({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  if (!(tab in TABS)) notFound();
  const t = TABS[tab as keyof typeof TABS];

  const { session, locked } = await pageGate(t.key);
  if (locked) return <Locked page={t.key} who={session.who!} />;
  const company = session.company;
  const user = session.user!;
  if (!company) return <NoCompany page={t.key} admin={session.who === "admin"} />;

  const supabase = await createClient();
  const period = currentPeriod();

  const { data: companyRow } = await supabase.from("company").select("*").eq("id", company.id).single<Company>();
  if (!companyRow) return <NoCompany page={t.key} admin={session.who === "admin"} />;

  let docItems: DocItem[] = [];
  if (tab === "once" || tab === "month") {
    const { data } = await supabase
      .from("doc_item")
      .select("*, doc_file(*), doc_item_message(*)")
      .eq("company_id", company.id)
      .eq("period", tab === "once" ? "ONCE" : period)
      .order("requested_at", { ascending: true });
    docItems = (data ?? []) as DocItem[];
  }

  const reviewer = session.who === "pba" || session.who === "admin";
  let teamUsers: { id: string; name: string | null; role: string }[] = [];
  if (reviewer) {
    const ids = [...new Set(docItems.flatMap((i) => [i.accepted_by, i.na_by]).filter((x): x is string => !!x))];
    if (ids.length > 0) {
      const { data } = await supabase.from("app_user").select("id, name, role").in("id", ids);
      teamUsers = data ?? [];
    }
  }

  const currentUser = { id: user.id, name: user.name, position: user.position, role: user.role };

  return (
    <>
      <PageHeader title={company.name} accent={`Uploads · ${t.label}`} sub={tab === "month" ? formatPeriodLabel(period) : t.blurb} />
      <div className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8">
        <div className="mb-6 flex flex-wrap gap-2">
          {(Object.keys(TABS) as (keyof typeof TABS)[]).map((k) => (
            <Link
              key={k}
              href={`/uploads/${k}`}
              className="btn-small"
              style={{
                background: k === tab ? "var(--bottomline-green)" : "transparent",
                color: k === tab ? "var(--paper)" : "var(--ink-secondary)",
                border: "1px solid " + (k === tab ? "var(--bottomline-green)" : "var(--rule)"),
              }}
            >
              {TABS[k].label}
            </Link>
          ))}
        </div>

        {tab === "qy" ? (
          <p className="text-[14px]" style={{ color: "var(--ink-secondary)" }}>
            Nothing is set up under quarterly &amp; yearly yet — those items arrive with the uploads restructure.
          </p>
        ) : reviewer ? (
          <UploadsReview company={companyRow} docItems={docItems} currentUser={currentUser} teamUsers={teamUsers} />
        ) : (
          <FounderView
            company={companyRow}
            docItems={docItems}
            currentUser={currentUser}
            mode={session.who === "founder" ? "founder" : "external"}
          />
        )}
      </div>
    </>
  );
}
