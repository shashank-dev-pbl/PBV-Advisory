import { pageGate } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";
import { externalFirmName } from "@/lib/firm";
import PageHeader from "../PageHeader";
import Locked from "../Locked";
import NoCompany from "../NoCompany";
import SettingUp from "../SettingUp";
import MasterWizard, { type FileRow, type LogItem, type Explainer } from "./MasterWizard";
import type { Answers, EventTypeDoc, LibDoc, MasterFiling, MasterRule } from "@/lib/master/types";

export default async function CompanyMasterPage() {
  const { session, locked } = await pageGate("cmaster");
  if (locked) return <Locked page="cmaster" who={session.who!} />;
  const company = session.company;
  if (!company) return <NoCompany page="cmaster" admin={session.who === "admin"} />;
  if (company.status === "setting_up") return <SettingUp page="cmaster" name={company.name} />;

  const supabase = await createClient();
  const [master, rules, filings, eventDocs, library, explainers, files, log, firm] = await Promise.all([
    supabase.from("company_master").select("answers, steps_done, completed").eq("company_id", company.id).maybeSingle(),
    supabase.from("master_rule").select("*").eq("active", true).order("sort"),
    supabase.from("master_filing").select("*").eq("active", true).order("sort"),
    supabase.from("event_type_doc").select("event_type, doc_code, need, condition_note").order("sort"),
    supabase.from("doc_library").select("code, name, form").order("sort"),
    supabase.from("doc_explainer").select("doc_type, name, what_it_is, why_it_matters"),
    supabase.from("file_version").select("id, req_key, period, version, storage_path, filename, by_name, at, reason, removed").eq("company_id", company.id).is("period", null).order("version", { ascending: false }),
    supabase.from("master_log").select("id, at, who_name, step, kind, note, reason").eq("company_id", company.id).order("at", { ascending: false }).limit(40),
    externalFirmName(supabase, company.id),
  ]);
  const error = master.error ?? rules.error ?? filings.error ?? eventDocs.error ?? library.error ?? explainers.error ?? files.error ?? log.error;
  if (error) {
    return (
      <>
        <PageHeader title={company.name} accent="Company master" />
        <div className="mx-auto w-full max-w-[1280px] px-5 py-8 md:px-8">
          <div className="p-4 text-[13px]" style={{ background: "#fbe9e7", border: "1px solid #e3b8b2", color: "#8c1a1a" }}>
            The company master could not load: {error.message}. If this mentions a missing table, the Build 5 SQL has not been run yet.
          </div>
        </div>
      </>
    );
  }
  const done = (master.data?.steps_done ?? []) as number[];

  return (
    <>
      <PageHeader title={company.name} accent="Company master" sub={`${done.length} of 12 steps done`} />
      <MasterWizard
        companyId={company.id}
        firmName={firm}
        initialAnswers={(master.data?.answers ?? {}) as Answers}
        initialDone={done}
        data={{
          rules: (rules.data ?? []) as MasterRule[],
          filings: (filings.data ?? []) as MasterFiling[],
          eventDocs: (eventDocs.data ?? []) as EventTypeDoc[],
          library: (library.data ?? []) as LibDoc[],
        }}
        explainers={(explainers.data ?? []) as Explainer[]}
        files={(files.data ?? []) as FileRow[]}
        log={(log.data ?? []) as LogItem[]}
      />
    </>
  );
}
