"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/permissions";
import { previousPeriods, formatPeriodLabel } from "@/lib/period";
import { getPublishedHistory } from "@/lib/periodFiguresView";
import { runwayMonths } from "@/lib/dashboardCalc";
import { sendEmail } from "@/lib/resend";
import type { PeriodFigures } from "@/lib/types";

// Verify and publish happen as one action, matching the mockup's single
// button — but the invariant that matters ("the account that verifies must
// not be the account that submitted") is enforced twice: here in the app
// layer, and again by a DB check constraint, since this is the one rule the
// whole product depends on.
export async function verifyAndPublish(periodFiguresId: string) {
  const appUser = await requireRole("pba");
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("period_figures")
    .select("submitted_by, period")
    .eq("id", periodFiguresId)
    .single();
  if (!row) throw new Error("Not found");
  if (row.submitted_by === appUser.id) {
    throw new Error("The account that submitted this month can't also verify it.");
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("period_figures")
    .update({
      state: "published",
      verified_by: appUser.id,
      verified_at: now,
      published_by: appUser.id,
      published_at: now,
    })
    .eq("id", periodFiguresId)
    .eq("company_id", appUser.company_id)
    .eq("state", "submitted");
  if (error) throw error;

  // Runway below 4 months fires an email alert to founder(s) and PBA, immediately, on publish.
  const published = await getPublishedHistory(appUser.company_id, row.period, 3);
  const { months } = runwayMonths(published);
  if (months !== null && months < 4) {
    const { data: recipients } = await supabase
      .from("app_user")
      .select("email")
      .eq("company_id", appUser.company_id)
      .in("role", ["founder", "pba"]);
    const recipientEmails = (recipients ?? []).map((r) => r.email);
    await sendEmail({
      to: recipientEmails,
      subject: `Runway alert — ${months.toFixed(1)} months (${formatPeriodLabel(row.period)})`,
      html: `<p>Runway is ${months.toFixed(1)} months as of the ${formatPeriodLabel(row.period)} close, below the 4-month threshold.</p>`,
    });
  }

  revalidatePath("/pba");
  revalidatePath("/founder/dashboard");
}

export async function sendBackWithQuery(periodFiguresId: string, queryText: string) {
  const appUser = await requireRole("pba");
  const supabase = await createClient();

  const { error } = await supabase
    .from("period_figures")
    .update({ state: "draft", query_text: queryText })
    .eq("id", periodFiguresId)
    .eq("company_id", appUser.company_id)
    .eq("state", "submitted");
  if (error) throw error;

  revalidatePath("/pba");
  revalidatePath("/practitioner");
}

export type PBAReviewData = {
  current: PeriodFigures & { mis_upload: { filename: string; uploaded_at: string } | null };
  previous: PeriodFigures | null;
} | null;

export async function getSubmittedForReview(companyId: string, period: string): Promise<PBAReviewData> {
  const supabase = await createClient();
  const { data: current } = await supabase
    .from("period_figures")
    .select("*, mis_upload:source_upload_id(filename, uploaded_at)")
    .eq("company_id", companyId)
    .eq("period", period)
    .eq("state", "submitted")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!current) return null;

  const priorPeriods = previousPeriods(period, 2).filter((p) => p !== period);
  const { data: previous } = await supabase
    .from("period_figures")
    .select("*")
    .eq("company_id", companyId)
    .in("period", priorPeriods)
    .eq("state", "published")
    .order("period", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { current, previous: previous ?? null };
}
