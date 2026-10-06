"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppUser, requireRole, requireItem } from "@/lib/permissions";

function refresh() {
  revalidatePath("/", "layout");
}

// Upload, replace and delete: the founder and the external practitioner. PBA only reviews.
export async function recordUpload(docItemId: string, storagePath: string, filename: string, label?: string) {
  const { supabase, appUser } = await requireItem(docItemId, "founder", "practitioner");
  if (!storagePath.startsWith(`${appUser.company_id}/`)) throw new Error("That file is not in this company's folder");

  // Per spec: a replaced upload is superseded, never deleted — old file rows stay in the
  // database as the audit trail, the UI just shows the latest one (see latestOf()).
  // For allows_multiple items there is no "superseding" — every row is a concurrently
  // active file (e.g. one bank statement per account), distinguished by its label.
  const { error: fileError } = await supabase
    .from("doc_file")
    .insert({ doc_item_id: docItemId, storage_path: storagePath, filename, label: label ?? null });
  if (fileError) throw new Error(fileError.message);

  const { error: statusError } = await supabase
    .from("doc_item")
    .update({ status: "uploaded", uploaded_at: new Date().toISOString() })
    .eq("id", docItemId)
    .in("status", ["pending", "query"]);
  if (statusError) throw new Error(statusError.message);

  refresh();
}

export async function deleteFile(docFileId: string, docItemId: string) {
  const { supabase } = await requireItem(docItemId, "founder", "practitioner");

  const { data: file } = await supabase.from("doc_file").select("storage_path").eq("id", docFileId).eq("doc_item_id", docItemId).single();
  if (file) {
    await supabase.storage.from("docs").remove([file.storage_path]);
    await supabase.from("doc_file").delete().eq("id", docFileId);
  }

  const { count } = await supabase
    .from("doc_file")
    .select("*", { count: "exact", head: true })
    .eq("doc_item_id", docItemId);

  if (!count) {
    await supabase
      .from("doc_item")
      .update({ status: "pending", uploaded_at: null })
      .eq("id", docItemId)
      .in("status", ["uploaded", "query"]);
  }

  refresh();
}

export async function markNilReturn(docItemId: string) {
  const { supabase, appUser } = await requireItem(docItemId, "founder");
  await supabase
    .from("doc_item")
    .update({
      status: "not_applicable",
      na_reason: "Founder confirmed — none to report",
      na_at: new Date().toISOString(),
      na_by: appUser.id,
      query_text: null,
    })
    .eq("id", docItemId);
  refresh();
}

export async function deleteUpload(docItemId: string) {
  const { supabase } = await requireItem(docItemId, "founder", "practitioner");

  const { data: existing } = await supabase
    .from("doc_file")
    .select("storage_path")
    .eq("doc_item_id", docItemId);

  if (existing && existing.length > 0) {
    await supabase.storage.from("docs").remove(existing.map((f) => f.storage_path));
    await supabase.from("doc_file").delete().eq("doc_item_id", docItemId);
  }

  await supabase
    .from("doc_item")
    .update({ status: "pending", uploaded_at: null })
    .eq("id", docItemId)
    .in("status", ["uploaded", "query"]);

  refresh();
}

export async function sendFounderMessage(docItemId: string, body: string) {
  const { supabase } = await requireItem(docItemId, "founder");

  const { error: msgError } = await supabase
    .from("doc_item_message")
    .insert({ doc_item_id: docItemId, sender: "founder", body });
  if (msgError) throw new Error(msgError.message);

  // Answering a query hands the item back to PBA's inbox for another look.
  const { error } = await supabase
    .from("doc_item")
    .update({ status: "uploaded", founder_last_read_at: new Date().toISOString() })
    .eq("id", docItemId)
    .eq("status", "query");
  if (error) throw new Error(error.message);

  refresh();
}

export async function markFounderRead(docItemId: string) {
  const { supabase } = await requireItem(docItemId, "founder");
  await supabase
    .from("doc_item")
    .update({ founder_last_read_at: new Date().toISOString() })
    .eq("id", docItemId);
  refresh();
}

// The company is always the one the founder is acting in — the id argument from the browser is not trusted.
export async function saveRevenueInfo(_companyId: string, revenueClassification: string, grossNetBilling: string) {
  const appUser = await requireRole("founder");
  const supabase = await createClient();

  const { error } = await supabase
    .from("company")
    .update({
      revenue_classification: revenueClassification,
      gross_net_billing: grossNetBilling,
    })
    .eq("id", appUser.company_id);
  if (error) throw new Error(error.message);

  refresh();
}

// Only files inside the folder of the company the person is acting in. Storage RLS checks again.
export async function getSignedDownloadUrl(storagePath: string) {
  const appUser = await requireAppUser();
  if (!storagePath.startsWith(`${appUser.company_id}/`)) throw new Error("You don't have access to this file");
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("docs").createSignedUrl(storagePath, 60 * 10);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
