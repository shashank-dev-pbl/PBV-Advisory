import { pageGate } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";
import PageHeader from "../PageHeader";
import Locked from "../Locked";
import NoCompany from "../NoCompany";
import SettingUp from "../SettingUp";
import MasterClient, { type MasterDoc, type RegRow, type LogRow } from "./MasterClient";
import type { ItrBasis } from "@/lib/compliance";

export default async function MasterPage() {
  const { session, locked } = await pageGate("master");
  if (locked) return <Locked page="master" who={session.who!} />;
  const company = session.company;
  if (!company) return <NoCompany page="master" admin={session.who === "admin"} />;
  if (company.status === "setting_up") return <SettingUp page="master" name={company.name} />;

  const supabase = await createClient();
  const [docs, regs, setting, log, counts] = await Promise.all([
    supabase.from("master_document").select("id, kind, filename, storage_path, uploaded_by_name, uploaded_at, registration_id").eq("company_id", company.id).order("uploaded_at", { ascending: false }),
    supabase.from("registration").select("id, kind, identifier, state, filing_type, forms, status, confirmed_by_name, confirmed_at").eq("company_id", company.id).order("confirmed_at"),
    supabase.from("compliance_setting").select("entity_type, effective_from, start_fy, itr_basis").eq("company_id", company.id).maybeSingle(),
    supabase.from("compliance_log").select("id, at, who_name, note, result").eq("company_id", company.id).order("at", { ascending: false }).limit(30),
    supabase.from("obligation").select("registration_id").eq("company_id", company.id).not("registration_id", "is", null),
  ]);
  const error = docs.error ?? regs.error ?? setting.error ?? log.error ?? counts.error;
  if (error) {
    return (
      <>
        <PageHeader title={company.name} accent="Master documents" />
        <div className="mx-auto w-full max-w-[1280px] px-5 py-8 md:px-8">
          <div className="p-4 text-[13px]" style={{ background: "#fbe9e7", border: "1px solid #e3b8b2", color: "#8c1a1a" }}>
            This page could not load: {error.message}. If this mentions a missing table, the compliance SQL has not been run yet.
          </div>
        </div>
      </>
    );
  }

  const perReg = new Map<string, number>();
  for (const o of counts.data ?? []) perReg.set(o.registration_id as string, (perReg.get(o.registration_id as string) ?? 0) + 1);

  return (
    <>
      <PageHeader title={company.name} accent="Master documents" sub="Upload a document, confirm what it says, and the compliance calendar is generated from it" />
      <div className="mx-auto w-full max-w-[1280px] px-5 py-8 md:px-8">
        <MasterClient
          companyId={company.id}
          canConfirm={session.who !== "founder"}
          docs={(docs.data ?? []) as MasterDoc[]}
          regs={((regs.data ?? []) as Omit<RegRow, "entries">[]).map((r) => ({ ...r, entries: perReg.get(r.id) ?? 0 }))}
          setting={{
            entity_type: setting.data?.entity_type ?? null,
            effective_from: setting.data?.effective_from ?? null,
            start_fy: setting.data?.start_fy ?? 2024,
            itr_basis: (setting.data?.itr_basis ?? "auto") as ItrBasis,
          }}
          log={(log.data ?? []) as LogRow[]}
        />
      </div>
    </>
  );
}
