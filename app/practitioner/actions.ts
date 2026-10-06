"use server";

import { revalidatePath } from "next/cache";
import { requireItem } from "@/lib/permissions";

function refresh() {
  revalidatePath("/", "layout");
}

// Accepting, asking and "not applicable" belong to PBA. An external practitioner uploads; they never check.
export async function acceptItem(docItemId: string) {
  const { supabase, appUser } = await requireItem(docItemId, "pba");
  const { error } = await supabase
    .from("doc_item")
    .update({ status: "accepted", accepted_at: new Date().toISOString(), accepted_by: appUser.id, query_text: null })
    .eq("id", docItemId);
  if (error) throw new Error(error.message);
  refresh();
}

export async function markNotApplicable(docItemId: string, reason: string) {
  const { supabase, appUser } = await requireItem(docItemId, "pba");
  const { error } = await supabase
    .from("doc_item")
    .update({
      status: "not_applicable",
      na_reason: reason,
      na_at: new Date().toISOString(),
      na_by: appUser.id,
      query_text: null,
    })
    .eq("id", docItemId);
  if (error) throw new Error(error.message);
  refresh();
}

export async function sendPractitionerMessage(docItemId: string, body: string) {
  const { supabase } = await requireItem(docItemId, "pba");

  const { error: msgError } = await supabase
    .from("doc_item_message")
    .insert({ doc_item_id: docItemId, sender: "practitioner", body });
  if (msgError) throw new Error(msgError.message);

  const { error } = await supabase
    .from("doc_item")
    .update({ status: "query", practitioner_last_read_at: new Date().toISOString() })
    .eq("id", docItemId)
    .not("status", "in", "(accepted,not_applicable)");
  if (error) throw new Error(error.message);
  refresh();
}

export async function markPractitionerRead(docItemId: string) {
  const { supabase } = await requireItem(docItemId, "pba");
  await supabase
    .from("doc_item")
    .update({ practitioner_last_read_at: new Date().toISOString() })
    .eq("id", docItemId);
  refresh();
}
