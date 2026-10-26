import { pageGate } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";
import { externalFirmName } from "@/lib/firm";
import PageHeader from "../PageHeader";
import Locked from "../Locked";
import NoCompany from "../NoCompany";
import SettingUp from "../SettingUp";
import DataRoomView from "./DataRoomView";
import type { FileRow, LogItem, Explainer, SummaryRow } from "../company-master/MasterWizard";
import type { Answers, EventTypeDoc, LibDoc, MasterFiling, MasterRule } from "@/lib/master/types";

// The data room is built from the company master: its standard documents, its events and the files uploaded against them.
export default async function DataRoomPage() {
  const { session, locked } = await pageGate("dataroom");
  if (locked) return <Locked page="dataroom" who={session.who!} />;
  const company = session.company;
  if (!company) return <NoCompany page="dataroom" admin={session.who === "admin"} />;
  if (company.status === "setting_up") return <SettingUp page="dataroom" name={company.name} />;

  const supabase = await createClient();
  const [master, rules, filings, eventDocs, library, explainers, files, log, firm, summaries] = await Promise.all([
    supabase.from("company_master").select("answers").eq("company_id", company.id).maybeSingle(),
    supabase.from("master_rule").select("*").eq("active", true).order("sort"),
    supabase.from("master_filing").select("*").eq("active", true).order("sort"),
    supabase.from("event_type_doc").select("event_type, doc_code, need, condition_note").order("sort"),
    supabase.from("doc_library").select("code, name, form").order("sort"),
    supabase.from("doc_explainer").select("*"),
    supabase.from("file_version").select("id, req_key, period, version, storage_path, filename, by_name, at, reason, removed").eq("company_id", company.id).is("period", null).order("version", { ascending: false }),
    supabase.from("master_log").select("id, at, who_name, step, kind, note, reason").eq("company_id", company.id).order("at", { ascending: false }).limit(100),
    externalFirmName(supabase, company.id),
    supabase.from("file_summary").select("req_key, period_key, field, value, entered_by_name, entered_at").eq("company_id", company.id).eq("period_key", ""),
  ]);
  const error = master.error ?? rules.error ?? filings.error ?? eventDocs.error ?? library.error ?? explainers.error ?? files.error ?? log.error ?? summaries.error;
  if (error) {
    return (
      <>
        <PageHeader title={company.name} accent="Data room" />
        <div className="mx-auto w-full max-w-[1280px] px-5 py-8 md:px-8">
          <div className="p-4 text-[13px]" style={{ background: "#fbe9e7", border: "1px solid #e3b8b2", color: "#8c1a1a" }}>The data room could not load: {error.message}</div>
        </div>
      </>
    );
  }
  return (
    <>
      <PageHeader title={company.name} accent="Data room" />
      <DataRoomView
        companyId={company.id}
        meName={session.user!.name ?? "You"}
        firmName={firm}
        answers={(master.data?.answers ?? {}) as Answers}
        data={{ rules: (rules.data ?? []) as MasterRule[], filings: (filings.data ?? []) as MasterFiling[], eventDocs: (eventDocs.data ?? []) as EventTypeDoc[], library: (library.data ?? []) as LibDoc[] }}
        explainers={(explainers.data ?? []) as Explainer[]}
        files={(files.data ?? []) as FileRow[]}
        summaries={(summaries.data ?? []) as SummaryRow[]}
        log={(log.data ?? []) as LogItem[]}
      />
    </>
  );
}
