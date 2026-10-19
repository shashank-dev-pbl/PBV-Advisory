"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/permissions";
import { newStandardVersion } from "@/lib/standardVersion";
import {
  ENTITY_TYPES, GSTIN_PATTERN, INDIAN_STATES, TAN_PATTERN, TDS_FORMS, generateObligations,
  type FilingType, type ItrBasis, type Owner, type Registration, type Rule, type Setting,
} from "@/lib/compliance";
import type { AppUser } from "@/lib/types";
import { guarded } from "@/lib/actionResult";

// Master > Services / Team / Custom types. Uploading a document only files it. Rows are generated when a
// practitioner (or PBA, or an admin acting as PBA) saves the facts. A founder can upload and view, never save.
const UPLOADERS = ["founder", "practitioner", "pba"] as const;
const MAINTAINERS = ["practitioner", "pba"] as const;
const OWNERS: Owner[] = ["founder", "practitioner", "pba"];
const KIND_TO_STANDARD = { gst: "gst", tan: "tan", coi: "coi" } as const;
type DocKind = keyof typeof KIND_TO_STANDARD;
type Client = Awaited<ReturnType<typeof createClient>>;

function inFolder(path: string, companyId: string) {
  if (!path.startsWith(`${companyId}/dataroom/`)) throw new Error("That file is not in this company's folder");
}

async function fileMasterDocument(supabase: Client, user: AppUser, kind: DocKind, storagePath: string, filename: string, registrationId: string | null) {
  inFolder(storagePath, user.company_id);
  const { error } = await supabase.from("master_document").insert({
    company_id: user.company_id, kind, storage_path: storagePath, filename, uploaded_by_name: user.name, registration_id: registrationId,
  });
  if (error) throw new Error(error.message);
  // The same file is the current copy of that document in the data room (older versions kept).
  await newStandardVersion(supabase, user.company_id, KIND_TO_STANDARD[kind], storagePath, filename, "Master", null, user.name);
}

// The Documents panel: anyone on the company can add a document.
async function _uploadMasterDocument(kind: DocKind, storagePath: string, filename: string) {
  const user = await requireRole(...UPLOADERS);
  if (!(kind in KIND_TO_STANDARD)) throw new Error("Unknown document type");
  await fileMasterDocument(await createClient(), user, kind, storagePath, filename, null);
  revalidatePath("/master", "layout");
  revalidatePath("/dataroom");
}

// Creates whatever rows are missing for the saved facts. Saving again adds only what is new.
async function generate(supabase: Client, user: AppUser, note: string): Promise<number> {
  const [{ data: rules }, { data: regs }, { data: setting }, { data: team }, { data: customs }] = await Promise.all([
    supabase.from("compliance_rule").select("*").eq("active", true).order("sort"),
    supabase.from("registration").select("id, kind, identifier, state, filing_type, forms, status").eq("company_id", user.company_id),
    supabase.from("compliance_setting").select("entity_type, effective_from, start_fy, itr_basis").eq("company_id", user.company_id).maybeSingle(),
    supabase.from("compliance_team").select("service, owner").eq("company_id", user.company_id),
    supabase.from("custom_compliance_type").select("registration_id, name, frequency, due_rule, owner").eq("company_id", user.company_id),
  ]);
  const settings: Setting = {
    entity_type: setting?.entity_type ?? null,
    effective_from: setting?.effective_from ?? null,
    start_fy: setting?.start_fy ?? 2024,
    itr_basis: (setting?.itr_basis ?? "auto") as ItrBasis,
  };
  const owners = Object.fromEntries((team ?? []).map((t) => [t.service, t.owner])) as Partial<Record<string, Owner>>;
  const customRules: Rule[] = (customs ?? []).map((c) => ({
    code: `custom_${c.registration_id}`, service: "Custom", name: c.name, category: "Custom", registration_kind: "custom" as const,
    frequency: c.frequency as Rule["frequency"], due_rule: c.due_rule as Rule["due_rule"], applies_when: {}, owner_default: c.owner as Owner, sort: 0,
  }));
  const rows = generateObligations([...((rules ?? []) as Rule[]), ...customRules], (regs ?? []) as Registration[], settings, new Date(), owners)
    .map((r) => ({ ...r, company_id: user.company_id, status: "pending" as const }));

  let created = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error } = await supabase
      .from("obligation")
      .upsert(rows.slice(i, i + 200), { onConflict: "company_id,rule_code,registration_id,period", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`Could not generate the compliance rows: ${error.message}`);
    created += data?.length ?? 0;
  }
  await supabase.from("compliance_log").insert({
    company_id: user.company_id, who_name: user.name, note,
    result: `${created} new compliance ${created === 1 ? "entry" : "entries"}`,
  });
  return created;
}

function refreshAll() {
  revalidatePath("/master", "layout");
  revalidatePath("/compliance");
  revalidatePath("/filings");
}

export type ServicesInput = {
  startFy: number;
  effectiveFrom: string | null;
  entityType: string | null;
  itrBasis: ItrBasis;
  trackItr: boolean;
  gst: { gstin: string; state: string; filingType: FilingType; certPath?: string; certName?: string }[];
  tan: { tan: string; forms: string[]; certPath?: string; certName?: string }[];
  note: string;
};

// The Save button on Master > Services.
async function _saveServices(input: ServicesInput): Promise<{ created: number }> {
  const user = await requireRole(...MAINTAINERS);
  const supabase = await createClient();

  if (!Number.isInteger(input.startFy) || input.startFy < 2020 || input.startFy > 2026) throw new Error("Choose a financial year from 2020-21 to 2026-27");
  if (!["auto", "non_audit", "audit", "tp"].includes(input.itrBasis)) throw new Error("Choose the income tax return basis");
  if (input.effectiveFrom && !/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) throw new Error("Enter the effective-from date");
  if (input.entityType && !(ENTITY_TYPES as readonly string[]).includes(input.entityType)) throw new Error("Choose the entity type");
  if (input.trackItr && !input.entityType) throw new Error("Choose the entity type before switching on the income tax return");

  const parts: string[] = [];
  const addReg = async (reg: { kind: "gst" | "tan" | "entity"; identifier: string; state?: string; filing_type?: FilingType; forms?: string[] }) => {
    const { data, error } = await supabase
      .from("registration")
      .upsert({ company_id: user.company_id, ...reg, status: "active", closed_at: null, confirmed_by_name: user.name, confirmed_at: new Date().toISOString() }, { onConflict: "company_id,kind,identifier" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data.id as string;
  };

  const { error: sErr } = await supabase.from("compliance_setting").upsert(
    { company_id: user.company_id, entity_type: input.entityType, effective_from: input.effectiveFrom || null, start_fy: input.startFy, itr_basis: input.itrBasis, updated_at: new Date().toISOString() },
    { onConflict: "company_id" },
  );
  if (sErr) throw new Error(sErr.message);

  for (const g of input.gst) {
    const gstin = g.gstin.trim().toUpperCase();
    if (!GSTIN_PATTERN.test(gstin)) throw new Error(`"${g.gstin}" doesn't look like a GSTIN — it is 15 characters, like 29ABCDE1234F1Z5`);
    if (!(INDIAN_STATES as readonly string[]).includes(g.state)) throw new Error(`Choose the state for ${gstin}`);
    if (g.filingType !== "regular") throw new Error("Only Regular GST filers are set up so far. QRMP and Composition rules are waiting for the company secretary to confirm them.");
    const id = await addReg({ kind: "gst", identifier: gstin, state: g.state, filing_type: g.filingType });
    if (g.certPath && g.certName) await fileMasterDocument(supabase, user, "gst", g.certPath, g.certName, id);
    parts.push(`GSTIN ${gstin} (${g.state})`);
  }
  for (const t of input.tan) {
    const tan = t.tan.trim().toUpperCase();
    if (!TAN_PATTERN.test(tan)) throw new Error(`"${t.tan}" doesn't look like a TAN — it is 10 characters, like BLRA12345B`);
    const forms = t.forms.filter((f) => (TDS_FORMS as readonly string[]).includes(f));
    if (forms.length === 0) throw new Error(`Choose at least one TDS form for ${tan}`);
    const id = await addReg({ kind: "tan", identifier: tan, forms });
    if (t.certPath && t.certName) await fileMasterDocument(supabase, user, "tan", t.certPath, t.certName, id);
    parts.push(`TAN ${tan} (${forms.join(", ")})`);
  }
  if (input.trackItr) {
    await addReg({ kind: "entity", identifier: "ENTITY" });
    parts.push(`income tax return (${input.entityType})`);
  }

  const why = input.note.trim();
  const created = await generate(supabase, user, `Saved services${parts.length ? `: ${parts.join("; ")}` : ""}${why ? ` — ${why}` : ""}`);
  refreshAll();
  return { created };
}

// Stops tracking a registration: its unfiled rows are closed ("no longer applicable") and kept in history, never deleted.
async function _closeRegistration(registrationId: string, reason: string) {
  const user = await requireRole(...MAINTAINERS);
  const supabase = await createClient();
  const why = reason.trim() || "Stopped tracking";
  const { data: reg } = await supabase.from("registration").select("id, company_id, identifier, kind").eq("id", registrationId).maybeSingle();
  if (!reg || reg.company_id !== user.company_id) throw new Error("You don't have access to this registration");

  const { error } = await supabase.from("registration").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", registrationId);
  if (error) throw new Error(error.message);
  const { data: closed } = await supabase
    .from("obligation")
    .update({ closed_reason: why })
    .eq("registration_id", registrationId)
    .eq("status", "pending")
    .is("closed_reason", null)
    .select("id");
  await supabase.from("compliance_log").insert({
    company_id: user.company_id, who_name: user.name, note: `Stopped tracking ${reg.kind === "entity" ? "income tax return" : `${reg.kind.toUpperCase()} ${reg.identifier}`} — ${why}`,
    result: `${closed?.length ?? 0} open ${closed?.length === 1 ? "entry" : "entries"} closed`,
  });
  refreshAll();
}

const SERVICES = ["GST", "TDS", "ITR", "Custom"] as const;

// Master > Team: the default owner for each service. Open rows of that service move to the new owner.
async function _saveTeam(owners: Record<string, Owner>) {
  const user = await requireRole(...MAINTAINERS);
  const supabase = await createClient();
  const rows = SERVICES.filter((s) => owners[s]).map((s) => {
    if (!OWNERS.includes(owners[s])) throw new Error("Choose who does the work");
    return { company_id: user.company_id, service: s, owner: owners[s] };
  });
  const { error } = await supabase.from("compliance_team").upsert(rows, { onConflict: "company_id,service" });
  if (error) throw new Error(error.message);
  let moved = 0;
  for (const r of rows) {
    const { data } = await supabase
      .from("obligation")
      .update({ owner: r.owner })
      .eq("company_id", user.company_id)
      .eq("category", r.service)
      .not("rule_code", "is", null)
      .eq("status", "pending")
      .is("closed_reason", null)
      .neq("owner", r.owner)
      .select("id");
    moved += data?.length ?? 0;
  }
  await supabase.from("compliance_log").insert({
    company_id: user.company_id, who_name: user.name, note: "Saved the team", result: `${moved} open ${moved === 1 ? "entry" : "entries"} moved`,
  });
  refreshAll();
  return { moved };
}

export type CustomTypeInput = { name: string; frequency: "monthly" | "quarterly" | "yearly"; day: number; month?: number; owner: Owner };

// Master > Custom types: your own non-statutory item. It applies at once and starts generating rows.
async function _addCustomType(input: CustomTypeInput): Promise<{ created: number }> {
  const user = await requireRole(...MAINTAINERS);
  const supabase = await createClient();
  const name = input.name.trim();
  if (!name) throw new Error("Give it a name, such as Fire NOC or FSSAI renewal");
  if (!OWNERS.includes(input.owner)) throw new Error("Choose who does the work");
  const day = Math.floor(input.day);
  if (!(day >= 1 && day <= 28)) throw new Error("Choose a due day from 1 to 28");

  let due_rule: Record<string, unknown>;
  if (input.frequency === "monthly") due_rule = { day, months_after: 1 };
  else if (input.frequency === "quarterly") {
    const dd = String(day).padStart(2, "0");
    due_rule = { by_quarter: { "1": `07-${dd}`, "2": `10-${dd}`, "3": `01-${dd}`, "4": `04-${dd}` } }; // that day, a month after the quarter ends
  } else {
    const month = Math.floor(input.month ?? 0);
    if (!(month >= 1 && month <= 12)) throw new Error("Choose the due month");
    due_rule = { mmdd: `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, years_after_fy_start: month >= 4 ? 0 : 1 };
  }

  const { data: reg, error } = await supabase
    .from("registration")
    .insert({ company_id: user.company_id, kind: "custom", identifier: name, status: "active", confirmed_by_name: user.name })
    .select("id")
    .single();
  if (error) throw new Error(error.code === "23505" ? `"${name}" is already being tracked` : error.message);
  const { error: cErr } = await supabase.from("custom_compliance_type").insert({
    company_id: user.company_id, registration_id: reg.id, name, frequency: input.frequency, due_rule, owner: input.owner,
  });
  if (cErr) throw new Error(cErr.message);

  const created = await generate(supabase, user, `Added custom type ${name} (${input.frequency})`);
  refreshAll();
  return { created };
}

// Exported actions return their reason instead of throwing, so the message survives a production build.
export async function uploadMasterDocument(...args: Parameters<typeof _uploadMasterDocument>) { return guarded(() => _uploadMasterDocument(...args)); }
export async function saveServices(...args: Parameters<typeof _saveServices>) { return guarded(() => _saveServices(...args)); }
export async function closeRegistration(...args: Parameters<typeof _closeRegistration>) { return guarded(() => _closeRegistration(...args)); }
export async function saveTeam(...args: Parameters<typeof _saveTeam>) { return guarded(() => _saveTeam(...args)); }
export async function addCustomType(...args: Parameters<typeof _addCustomType>) { return guarded(() => _addCustomType(...args)); }
