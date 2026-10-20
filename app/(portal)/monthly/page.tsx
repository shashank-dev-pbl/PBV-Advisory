import { pageGate } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";
import { externalFirmName } from "@/lib/firm";
import PageHeader from "../PageHeader";
import Locked from "../Locked";
import NoCompany from "../NoCompany";
import SettingUp from "../SettingUp";
import MonthlyClose, { type MonthRow, type VerifyRow } from "./MonthlyClose";
import type { FileRow, Explainer, SummaryRow } from "../company-master/MasterWizard";
import type { Answers, EventTypeDoc, LibDoc, MasterFiling, MasterRule } from "@/lib/master/types";

export default async function MonthlyPage() {
  const { session, locked } = await pageGate("monthly");
  if (locked) return <Locked page="monthly" who={session.who!} />;
  const company = session.company;
  if (!company) return <NoCompany page="monthly" admin={session.who === "admin"} />;
  if (company.status === "setting_up") return <SettingUp page="monthly" name={company.name} />;

  const supabase = await createClient();
  const [master, rules, filings, eventDocs, library, explainers, files, months, verifies, firm, summaries, co] = await Promise.all([
    supabase.from("company_master").select("answers").eq("company_id", company.id).maybeSingle(),
    supabase.from("master_rule").select("*").eq("active", true).order("sort"),
    supabase.from("master_filing").select("*").eq("active", true).order("sort"),
    supabase.from("event_type_doc").select("event_type, doc_code, need, condition_note").order("sort"),
    supabase.from("doc_library").select("code, name, form").order("sort"),
    supabase.from("doc_explainer").select("*"),
    supabase.from("file_version").select("id, req_key, period, version, storage_path, filename, by_name, at, reason, removed").eq("company_id", company.id).not("period", "is", null).order("version", { ascending: false }),
    supabase.from("month").select("period, submitted_by, submitted_by_name, submitted_at, published_by_name, published_at, reopened").eq("company_id", company.id),
    supabase.from("filing_verify").select("period, filing_key, verified_by_name").eq("company_id", company.id),
    externalFirmName(supabase, company.id),
    supabase.from("file_summary").select("req_key, period_key, field, value, entered_by_name, entered_at").eq("company_id", company.id).neq("period_key", ""),
    supabase.from("company").select("tracking_start").eq("id", company.id).maybeSingle(),
  ]);
  const error = master.error ?? rules.error ?? filings.error ?? eventDocs.error ?? library.error ?? explainers.error ?? files.error ?? months.error ?? verifies.error ?? summaries.error ?? co.error;
  if (error) {
    return (
      <>
        <PageHeader title={company.name} accent="Monthly close" />
        <div className="mx-auto w-full max-w-[1280px] px-5 py-8 md:px-8">
          <div className="p-4 text-[13px]" style={{ background: "#fbe9e7", border: "1px solid #e3b8b2", color: "#8c1a1a" }}>
            Monthly close could not load: {error.message}. If this mentions a missing table, the Build 5 SQL has not been run yet.
          </div>
        </div>
      </>
    );
  }
  const answers = (master.data?.answers ?? {}) as Answers;
  return (
    <>
      <PageHeader title={company.name} accent="Monthly close" />
      <MonthlyClose
        companyId={company.id}
        who={session.who as "founder" | "external" | "pba" | "admin"}
        meId={session.user!.id}
        firmName={firm}
        answers={answers}
        trackingStart={co.data?.tracking_start ?? answers.trackingStart ?? null}
        data={{
          rules: (rules.data ?? []) as MasterRule[],
          filings: (filings.data ?? []) as MasterFiling[],
          eventDocs: (eventDocs.data ?? []) as EventTypeDoc[],
          library: (library.data ?? []) as LibDoc[],
        }}
        explainers={(explainers.data ?? []) as Explainer[]}
        files={(files.data ?? []) as FileRow[]}
        summaries={(summaries.data ?? []) as SummaryRow[]}
        months={(months.data ?? []) as MonthRow[]}
        verifies={(verifies.data ?? []) as VerifyRow[]}
      />
    </>
  );
}
