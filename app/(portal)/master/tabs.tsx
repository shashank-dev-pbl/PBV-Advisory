import { createClient } from "@/lib/supabase/server";
import type { ItrBasis, Owner } from "@/lib/compliance";
import ServicesClient, { type LogRow, type MasterDoc, type RegRow } from "./ServicesClient";
import TeamClient from "./TeamClient";
import CustomClient, { type CustomRow } from "./CustomClient";

function LoadError({ what, message }: { what: string; message: string }) {
  return (
    <div className="p-4 text-[13px]" style={{ background: "#fbe9e7", border: "1px solid #e3b8b2", color: "#8c1a1a" }}>
      {what} could not load: {message}. If this mentions a missing table, the compliance SQL has not been run yet.
    </div>
  );
}

async function entryCounts(companyId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("obligation").select("registration_id, category").eq("company_id", companyId).is("closed_reason", null).not("registration_id", "is", null);
  const perReg = new Map<string, number>();
  const perCategory = new Map<string, number>();
  for (const o of data ?? []) {
    perReg.set(o.registration_id as string, (perReg.get(o.registration_id as string) ?? 0) + 1);
    perCategory.set(o.category as string, (perCategory.get(o.category as string) ?? 0) + 1);
  }
  return { perReg, perCategory, error };
}

export async function ServicesTab({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const supabase = await createClient();
  const [docs, regs, setting, log, counts] = await Promise.all([
    supabase.from("master_document").select("id, kind, filename, storage_path, uploaded_by_name, uploaded_at, registration_id").eq("company_id", companyId).order("uploaded_at", { ascending: false }),
    supabase.from("registration").select("id, kind, identifier, state, filing_type, forms, status, confirmed_by_name, confirmed_at").eq("company_id", companyId).neq("kind", "custom").order("confirmed_at"),
    supabase.from("compliance_setting").select("entity_type, effective_from, start_fy, itr_basis").eq("company_id", companyId).maybeSingle(),
    supabase.from("compliance_log").select("id, at, who_name, note, result").eq("company_id", companyId).order("at", { ascending: false }).limit(30),
    entryCounts(companyId),
  ]);
  const error = docs.error ?? regs.error ?? setting.error ?? log.error ?? counts.error;
  if (error) return <LoadError what="Services" message={error.message} />;
  return (
    <ServicesClient
      companyId={companyId}
      canEdit={canEdit}
      docs={(docs.data ?? []) as MasterDoc[]}
      regs={((regs.data ?? []) as Omit<RegRow, "entries">[]).map((r) => ({ ...r, entries: counts.perReg.get(r.id) ?? 0 }))}
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

export async function TeamTab({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const supabase = await createClient();
  const [team, counts] = await Promise.all([supabase.from("compliance_team").select("service, owner").eq("company_id", companyId), entryCounts(companyId)]);
  const error = team.error ?? counts.error;
  if (error) return <LoadError what="Team" message={error.message} />;
  // Only services that are actually being tracked get a line, as in CXO Lens.
  const services = [
    { service: "GST", label: "GST", entries: counts.perCategory.get("GST") ?? 0 },
    { service: "TDS", label: "TDS", entries: counts.perCategory.get("TDS") ?? 0 },
    { service: "ITR", label: "Income tax return", entries: counts.perCategory.get("ITR") ?? 0 },
    { service: "Custom", label: "Custom types", entries: counts.perCategory.get("Custom") ?? 0 },
  ].filter((s) => s.entries > 0);
  return <TeamClient canEdit={canEdit} services={services} owners={Object.fromEntries((team.data ?? []).map((t) => [t.service, t.owner])) as Record<string, Owner>} />;
}

export async function CustomTab({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const supabase = await createClient();
  const [types, regs, counts] = await Promise.all([
    supabase.from("custom_compliance_type").select("registration_id, name, frequency, owner").eq("company_id", companyId).order("created_at"),
    supabase.from("registration").select("id, status").eq("company_id", companyId).eq("kind", "custom"),
    entryCounts(companyId),
  ]);
  const error = types.error ?? regs.error ?? counts.error;
  if (error) return <LoadError what="Custom types" message={error.message} />;
  const status = new Map((regs.data ?? []).map((r) => [r.id as string, r.status as "active" | "closed"]));
  const rows: CustomRow[] = (types.data ?? []).map((t) => ({
    registrationId: t.registration_id, name: t.name, frequency: t.frequency, owner: t.owner,
    status: status.get(t.registration_id) ?? "active", entries: counts.perReg.get(t.registration_id) ?? 0,
  }));
  return <CustomClient canEdit={canEdit} rows={rows} />;
}
