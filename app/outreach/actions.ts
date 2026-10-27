"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { canOpen } from "@/lib/access";
import { guarded, type ActionResult } from "@/lib/actionResult";

// The one write on the Outreach page: give the extension the founder it could not find on its own. The lead moves to
// "Founder found" and the extension sends the connection request on its next round, the same as for a lead it found itself.
// The database function only accepts leads in Needs review or No founder found, and only from PBA staff.
const LINKEDIN_PROFILE = /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[^\s/?#]+/i;
const LINKEDIN_COMPANY = /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/company\/[^\s/?#]+/i;

export async function giveFounder(input: {
  id: number; founderUrl: string; founderName: string; founderTitle: string; companyUrl: string;
}): Promise<ActionResult<null>> {
  return guarded(async () => {
    const session = await getSession();
    if (!session.user || !session.who || !canOpen(session.who, "outreach")) throw new Error("You don't have access to this action");

    const founderUrl = input.founderUrl.trim().split("?")[0].replace(/\/$/, "");
    const founderName = input.founderName.trim();
    const founderTitle = input.founderTitle.trim();
    const companyUrl = input.companyUrl.trim().split("?")[0].replace(/\/$/, "");
    if (!LINKEDIN_PROFILE.test(founderUrl)) throw new Error("Paste the founder's LinkedIn profile link (linkedin.com/in/…)");
    if (founderName.length < 2) throw new Error("Add the founder's name, it is used in the message");
    if (companyUrl && !LINKEDIN_COMPANY.test(companyUrl)) throw new Error("The company link should look like linkedin.com/company/…");

    const supabase = await createClient();
    const { error } = await supabase.rpc("outreach_give_founder", {
      p_id: input.id, p_founder_url: founderUrl, p_founder_name: founderName, p_founder_title: founderTitle, p_company_url: companyUrl,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/outreach");
    return null;
  });
}
