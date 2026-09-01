"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function acceptItem(docItemId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("doc_item")
    .update({ status: "accepted", accepted_at: new Date().toISOString(), query_text: null })
    .eq("id", docItemId);
  if (error) throw error;

  revalidatePath("/practitioner");
  revalidatePath("/founder");
}

export async function acceptWithWaiver(docItemId: string, note: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("doc_item")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      reply_text: `Waived — ${note}`,
      query_text: null,
    })
    .eq("id", docItemId);
  if (error) throw error;

  revalidatePath("/practitioner");
  revalidatePath("/founder");
}

export async function sendPractitionerMessage(docItemId: string, body: string) {
  const supabase = await createClient();

  const { error: msgError } = await supabase
    .from("doc_item_message")
    .insert({ doc_item_id: docItemId, sender: "practitioner", body });
  if (msgError) throw msgError;

  const { error } = await supabase
    .from("doc_item")
    .update({ status: "query", practitioner_last_read_at: new Date().toISOString() })
    .eq("id", docItemId)
    .neq("status", "accepted");
  if (error) throw error;

  revalidatePath("/practitioner");
  revalidatePath("/founder");
}

export async function markPractitionerRead(docItemId: string) {
  const supabase = await createClient();
  await supabase
    .from("doc_item")
    .update({ practitioner_last_read_at: new Date().toISOString() })
    .eq("id", docItemId);
  revalidatePath("/practitioner");
}

export async function recordDeliverableUpload(deliverableId: string, storagePath: string, filename: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("deliverable")
    .update({
      output_path: storagePath,
      output_filename: filename,
      status: "delivered",
      delivered_at: new Date().toISOString(),
    })
    .eq("id", deliverableId);
  if (error) throw error;

  revalidatePath("/practitioner");
  revalidatePath("/founder");
}

export async function getSignedDownloadUrl(storagePath: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("docs").createSignedUrl(storagePath, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}
