"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/permissions";

// Founders view and download only. Every write here is for the external practitioner and PBA (admins act as
// PBA) and works only inside the company they are acting in. The database refuses the same writes again.
const MAINTAINERS = ["practitioner", "pba"] as const;

async function ownEvent(eventId: string) {
  const user = await requireRole(...MAINTAINERS);
  const supabase = await createClient();
  const { data: ev } = await supabase.from("event").select("id, title, company_id").eq("id", eventId).maybeSingle();
  if (!ev || ev.company_id !== user.company_id) throw new Error("You don't have access to this event");
  return { user, supabase, ev };
}

function inFolder(path: string, companyId: string) {
  if (!path.startsWith(`${companyId}/dataroom/`)) throw new Error("That file is not in this company's data room folder");
}

export async function createEvent(input: { type: string; date: string; title: string; description: string; amount: string }) {
  const user = await requireRole(...MAINTAINERS);
  const supabase = await createClient();
  if (!input.type || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Choose the event type and its date");
  const { data: t } = await supabase.from("event_type").select("name").eq("code", input.type).maybeSingle();
  if (!t) throw new Error("Unknown event type");
  const { data, error } = await supabase
    .from("event")
    .insert({
      company_id: user.company_id,
      type: input.type,
      event_date: input.date,
      title: input.title.trim() || t.name,
      description: input.description.trim() || null,
      amount: input.amount.trim() || null,
      created_by_name: user.name,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/dataroom");
  return data.id as string;
}

// Adds a file to an event. docCode is a library code, or null with otherName for "Other — not in this list".
// If the document is one a standard kind keeps a current copy of (an altered AOA, say), that copy is
// replaced by a new version and the earlier one is kept.
export async function addEventDocument(input: { eventId: string; docCode: string | null; otherName?: string; storagePath: string; filename: string }) {
  const { user, supabase, ev } = await ownEvent(input.eventId);
  inFolder(input.storagePath, user.company_id);
  const other = input.otherName?.trim() || null;
  if (!input.docCode && !other) throw new Error("Name the document");
  if (input.docCode) {
    const { data: d } = await supabase.from("doc_library").select("code").eq("code", input.docCode).maybeSingle();
    if (!d) throw new Error("Unknown document");
  }
  const { error } = await supabase.from("event_document").insert({
    event_id: input.eventId,
    company_id: user.company_id,
    doc_code: input.docCode,
    other_name: input.docCode ? null : other,
    status: "uploaded",
    storage_path: input.storagePath,
    filename: input.filename,
    by_name: user.name,
  });
  if (error) throw new Error(error.message);

  if (input.docCode) {
    const { data: kinds } = await supabase.from("standard_kind").select("code").contains("doc_codes", [input.docCode]);
    for (const k of kinds ?? []) await newStandardVersion(supabase, user.company_id, k.code, input.storagePath, input.filename, ev.title, ev.id, user.name);
  }
  revalidatePath("/dataroom");
}

export async function markEventDocNotApplicable(eventId: string, docCode: string, reason: string) {
  const { user, supabase } = await ownEvent(eventId);
  const { error } = await supabase.from("event_document").insert({
    event_id: eventId,
    company_id: user.company_id,
    doc_code: docCode,
    status: "not_applicable",
    na_reason: reason.trim() || "Does not apply to this event",
    by_name: user.name,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dataroom");
}

export async function uploadStandardDocument(kind: string, storagePath: string, filename: string) {
  const user = await requireRole(...MAINTAINERS);
  inFolder(storagePath, user.company_id);
  const supabase = await createClient();
  await newStandardVersion(supabase, user.company_id, kind, storagePath, filename, "One-time upload", null, user.name);
  revalidatePath("/dataroom");
}

async function newStandardVersion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  kind: string,
  storagePath: string,
  filename: string,
  source: string,
  sourceEventId: string | null,
  by: string | null,
) {
  const { data: k } = await supabase.from("standard_kind").select("code").eq("code", kind).maybeSingle();
  if (!k) throw new Error("Unknown document kind");
  const { data: last } = await supabase
    .from("standard_document")
    .select("version")
    .eq("company_id", companyId)
    .eq("kind", kind)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("standard_document").insert({
    company_id: companyId,
    kind,
    version: (last?.version ?? 0) + 1,
    storage_path: storagePath,
    filename,
    source,
    source_event_id: sourceEventId,
    by_name: by,
  });
  if (error) throw new Error(error.message);
}
