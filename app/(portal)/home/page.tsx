import { pageGate } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";
import { closePeriod, formatPeriodLabel } from "@/lib/period";
import PageHeader from "../PageHeader";
import Locked from "../Locked";
import OpenCompany from "../OpenCompany";

export default async function HomePage() {
  const { session, locked } = await pageGate("home");
  if (locked) return <Locked page="home" who={session.who!} />;

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const cards = await Promise.all(
    session.companies.map(async (c) => {
      const head = { count: "exact" as const, head: true };
      const [sub, up, fil, lateRes] = await Promise.all([
        supabase.from("period_figures").select("*", head).eq("company_id", c.id).eq("state", "submitted"),
        supabase.from("doc_item").select("*", head).eq("company_id", c.id).eq("status", "uploaded"),
        supabase.from("obligation").select("*", head).eq("company_id", c.id).eq("status", "filed"),
        supabase.from("doc_item").select("*", head).eq("company_id", c.id).eq("priority", "must").eq("status", "pending").lt("due_date", today),
      ]);
      const submitted = sub.count ?? 0;
      const uploadsWaiting = up.count ?? 0;
      const filingsWaiting = fil.count ?? 0;
      const late = lateRes.count ?? 0;
      return { company: c, submitted, uploadsWaiting, filingsWaiting, late };
    })
  );

  return (
    <>
      <PageHeader title="My companies" sub="Only the companies you have been given access to." />
      <div className="mx-auto w-full max-w-[1280px] px-5 py-8 md:px-8">
        {cards.length === 0 && <p className="text-[14px]" style={{ color: "var(--ink-secondary)" }}>You are not on any company yet.</p>}
        <div className="flex flex-col gap-3">
          {cards.map(({ company, submitted, uploadsWaiting, filingsWaiting, late }) => {
            const waiting = submitted + uploadsWaiting + filingsWaiting;
            return (
              <div key={company.id} className="p-4" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 10 }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[16px] font-bold" style={{ color: "var(--ink)" }}>{company.name}</p>
                    {company.status === "setting_up" ? (
                      <p className="mt-1 text-[13px]" style={{ color: "var(--ink-secondary)" }}>Being set up by admin · nothing requested yet</p>
                    ) : (
                      <div className="mt-1 text-[13px]" style={{ color: "var(--ink-secondary)" }}>
                        {submitted > 0 && <p>{formatPeriodLabel(closePeriod())} close submitted · ready for you to check</p>}
                        {uploadsWaiting > 0 && <p>{uploadsWaiting} document{uploadsWaiting === 1 ? "" : "s"} uploaded, waiting to be accepted</p>}
                        {filingsWaiting > 0 && <p>{filingsWaiting} filing{filingsWaiting === 1 ? "" : "s"} waiting to be verified</p>}
                        {late > 0 && <p style={{ color: "#8c1a1a", fontWeight: 600 }}>{late} mandatory item{late === 1 ? "" : "s"} late</p>}
                        {waiting === 0 && late === 0 && <p>Up to date — nothing waiting on you.</p>}
                      </div>
                    )}
                  </div>
                  <span className="pill" style={{ background: company.status === "live" ? (waiting > 0 ? "rgba(184,134,11,0.14)" : "var(--bottomline-green)") : "rgba(107,99,87,0.14)", color: company.status === "live" ? (waiting > 0 ? "#7a5a00" : "#fff") : "var(--ink-secondary)" }}>
                    {company.status === "setting_up" ? "Setting up" : waiting > 0 ? "Needs you" : "Up to date"}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {submitted > 0 && <OpenCompany companyId={company.id} href="/close" label={`Check ${formatPeriodLabel(closePeriod()).split(" ")[0]}`} primary />}
                  <OpenCompany companyId={company.id} href="/uploads/month" label="Monthly uploads" />
                  <OpenCompany companyId={company.id} href="/filings" label="Filings" />
                  <OpenCompany companyId={company.id} href="/dashboard" label="Dashboard" />
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-6 text-center text-[12px]" style={{ color: "var(--ink-secondary)" }}>Shows only the companies admin has tagged you to.</p>
      </div>
    </>
  );
}
