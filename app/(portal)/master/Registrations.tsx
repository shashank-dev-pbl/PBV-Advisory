import { createClient } from "@/lib/supabase/server";
import MasterClient, { type MasterDoc, type RegRow, type LogRow } from "./MasterClient";
import type { ItrBasis } from "@/lib/compliance";

// The document-to-compliance part of Master: upload a certificate, confirm what it says, and the calendar is generated.
export default async function Registrations({ companyId, canConfirm }: { companyId: string; canConfirm: boolean }) {
  const company = { id: companyId };
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
      <div className="mb-6 p-4 text-[13px]" style={{ background: "#fbe9e7", border: "1px solid #e3b8b2", color: "#8c1a1a" }}>
        The compliance section could not load: {error.message}. If this mentions a missing table, the compliance SQL has not been run yet.
      </div>
    );
  }

  const perReg = new Map<string, number>();
  for (const o of counts.data ?? []) perReg.set(o.registration_id as string, (perReg.get(o.registration_id as string) ?? 0) + 1);

  return (
    <MasterClient
      companyId={company.id}
      canConfirm={canConfirm}
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
  );
}
