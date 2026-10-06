"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/permissions";
import { closePeriod } from "@/lib/period";

// The one line the external practitioner posts each month (by the 5th): what is filed, what is pending, any
// notice. The dashboard's compliance tiles read from it. Only the external practitioner can post it.
export async function postMonthlyLine(body: string) {
  const user = await requireRole("practitioner");
  const text = body.trim();
  if (!text) throw new Error("Write the line first");
  if (text.length > 400) throw new Error("Keep it to one or two sentences (400 characters)");
  const supabase = await createClient();
  const { error } = await supabase.from("monthly_line").upsert(
    { company_id: user.company_id, period: closePeriod(), body: text, posted_by_name: user.firm_name ?? user.name, posted_at: new Date().toISOString() },
    { onConflict: "company_id,period" },
  );
  if (error) throw new Error(error.message);
  revalidatePath("/filings");
  revalidatePath("/dashboard");
}
