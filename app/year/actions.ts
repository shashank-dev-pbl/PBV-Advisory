"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppUser, requireRole } from "@/lib/permissions";
import type { Obligation } from "@/lib/types";

export async function getObligations(companyId: string): Promise<Obligation[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("obligation")
    .select("*")
    .eq("company_id", companyId)
    .order("statutory_due_date", { ascending: true });
  return (data ?? []) as Obligation[];
}

// A filing is "filed" the moment evidence is attached — status is earned by
// the evidence existing, not by typing a date into a field. Only the
// obligation's own owner can do this; PBA's separate verify step is the
// second pair of eyes.
export async function markFiled(params: {
  obligationId: string;
  storagePath: string;
  filename: string;
  filedOn: string;
}) {
  const appUser = await requireAppUser();
  const supabase = await createClient();

  const { data: ob } = await supabase.from("obligation").select("owner, company_id").eq("id", params.obligationId).single();
  if (!ob) throw new Error("Not found");
  if (ob.company_id !== appUser.company_id) throw new Error("Not authorized");
  if (ob.owner !== appUser.role) throw new Error(`Only the ${ob.owner} is expected to file this.`);

  const { error } = await supabase
    .from("obligation")
    .update({
      status: "filed",
      filed_on: params.filedOn,
      evidence_storage_path: params.storagePath,
      evidence_filename: params.filename,
      filed_by: appUser.id,
    })
    .eq("id", params.obligationId)
    .eq("company_id", appUser.company_id);
  if (error) throw error;

  revalidatePath("/year");
}

export async function verifyFiling(obligationId: string) {
  const appUser = await requireRole("pba");
  const supabase = await createClient();

  const { data: ob } = await supabase.from("obligation").select("filed_by").eq("id", obligationId).single();
  if (!ob) throw new Error("Not found");
  if (ob.filed_by === appUser.id) {
    throw new Error("The account that filed this can't also verify it.");
  }

  const { error } = await supabase
    .from("obligation")
    .update({ status: "verified", verified_by: appUser.id, verified_at: new Date().toISOString() })
    .eq("id", obligationId)
    .eq("company_id", appUser.company_id)
    .eq("status", "filed");
  if (error) throw error;

  revalidatePath("/year");
}
