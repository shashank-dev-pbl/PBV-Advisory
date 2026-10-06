"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppUser, requireRole } from "@/lib/permissions";
import { formatPeriodLabel, periodHasEnded } from "@/lib/period";
import { getPublishedHistory } from "@/lib/periodFiguresView";
import { runwayMonths } from "@/lib/dashboardCalc";
import { sendEmail } from "@/lib/resend";
import type { PeriodFigures } from "@/lib/types";

function refresh() {
  revalidatePath("/", "layout");
}

// Verify and publish happen as one action, matching the mockup's single button. The rules that
// matter — an external practitioner can never publish, and the account that submitted a month can
// never be the one that publishes it — are enforced here, in row-level security, and again by DB
// check constraints, so calling this action directly gets the same refusal as the button.
export async function verifyAndPublish(periodFiguresId: string) {
  const appUser = await requireRole("pba");
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("period_figures")
    .select("submitted_by, period, state, company_id")
    .eq("id", periodFiguresId)
    .maybeSingle();
  if (!row || row.company_id !== appUser.company_id) throw new Error("You don't have access to this month");
  if (row.state !== "submitted") throw new Error("Only a submitted month can be published");
  if (!periodHasEnded(row.period)) throw new Error(`${formatPeriodLabel(row.period)} has not ended yet — it can be published from the 1st of next month.`);
  if (row.submitted_by === appUser.id) {
    throw new Error("The account that submitted this month can't also publish it.");
  }

  const now = new Date().toISOString();
  const { data: published, error } = await supabase
    .from("period_figures")
    .update({
      state: "published",
      verified_by: appUser.id,
      verified_at: now,
      published_by: appUser.id,
      published_at: now,
      query_text: null,
    })
    .eq("id", periodFiguresId)
    .eq("company_id", appUser.company_id)
    .eq("state", "submitted")
    .select("id");
  if (error) throw new Error(error.message);
  if (!published || published.length === 0) throw new Error("This month was not published — it may have changed. Reload and try again.");

  // A republished (corrected) month retires the earlier version: kept, but no longer shown to the founder.
  await supabase
    .from("period_figures")
    .update({ state: "superseded", query_text: null })
    .eq("company_id", appUser.company_id)
    .eq("period", row.period)
    .eq("state", "published")
    .neq("id", periodFiguresId);

  // Runway below 4 months fires an email alert to the founder(s) and PBA, immediately, on publish.
  const history = await getPublishedHistory(appUser.company_id, row.period, 3);
  const { months } = runwayMonths(history);
  if (months !== null && months < 4) {
    const { data: grants } = await supabase
      .from("company_access")
      .select("role, user:user_id(email)")
      .eq("company_id", appUser.company_id)
      .is("revoked_at", null)
      .in("role", ["founder", "pba"]);
    const recipientEmails = ((grants ?? []) as unknown as { user: { email: string } | null }[])
      .map((g) => g.user?.email)
      .filter((e): e is string => !!e);
    if (recipientEmails.length > 0) {
      await sendEmail({
        to: recipientEmails,
        subject: `Runway alert — ${months.toFixed(1)} months (${formatPeriodLabel(row.period)})`,
        html: `<p>Runway is ${months.toFixed(1)} months as of the ${formatPeriodLabel(row.period)} close, below the 4-month threshold.</p>`,
      });
    }
  }

  refresh();
}

export async function sendBackWithQuery(periodFiguresId: string, queryText: string) {
  const appUser = await requireRole("pba");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("period_figures")
    .update({ state: "draft", query_text: queryText })
    .eq("id", periodFiguresId)
    .eq("company_id", appUser.company_id)
    .eq("state", "submitted")
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("This month is no longer waiting for review. Reload and try again.");

  refresh();
}

// "Republish with corrected figures": PBA cannot edit published figures (they stay SPARC's), so it asks
// the external practitioner for a corrected workbook. The founder keeps seeing the published version
// until the corrected one is submitted, checked, and published in its place.
export async function requestCorrection(periodFiguresId: string, note: string) {
  const appUser = await requireRole("pba");
  const supabase = await createClient();
  if (!note.trim()) throw new Error("Say what needs correcting");

  const { data, error } = await supabase
    .from("period_figures")
    .update({ query_text: note.trim() })
    .eq("id", periodFiguresId)
    .eq("company_id", appUser.company_id)
    .eq("state", "published")
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Only a published month can be sent for correction");

  refresh();
}

export type MonthRow = {
  id: string;
  period: string;
  version: number;
  state: PeriodFigures["state"];
  query_text: string | null;
  submitted_at: string | null;
  published_at: string | null;
  filename: string | null;
};

// Every month the company has, newest first — the latest version of each, whatever state it is in.
export async function listMonths(): Promise<MonthRow[]> {
  const appUser = await requireAppUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("period_figures")
    .select("id, period, version, state, query_text, submitted_at, published_at, mis_upload:source_upload_id(filename)")
    .eq("company_id", appUser.company_id)
    .neq("state", "superseded")
    .order("period", { ascending: false })
    .order("version", { ascending: false });

  const seen = new Set<string>();
  const rows: MonthRow[] = [];
  for (const r of (data ?? []) as unknown as (Omit<MonthRow, "filename"> & { mis_upload: { filename: string } | null })[]) {
    if (seen.has(r.period)) continue;
    seen.add(r.period);
    rows.push({ ...r, filename: r.mis_upload?.filename ?? null });
  }
  return rows;
}

export type PBAReviewData = {
  current: PeriodFigures & { mis_upload: { filename: string; uploaded_at: string } | null };
  previous: PeriodFigures | null;
} | null;

// One month's figures beside the last published month before it.
export async function getReview(periodFiguresId: string): Promise<PBAReviewData> {
  const appUser = await requireAppUser();
  const supabase = await createClient();
  const { data: current } = await supabase
    .from("period_figures")
    .select("*, mis_upload:source_upload_id(filename, uploaded_at)")
    .eq("id", periodFiguresId)
    .eq("company_id", appUser.company_id)
    .maybeSingle();
  if (!current) return null;

  const { data: previous } = await supabase
    .from("period_figures")
    .select("*")
    .eq("company_id", appUser.company_id)
    .lt("period", current.period)
    .eq("state", "published")
    .order("period", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { current, previous: previous ?? null };
}
