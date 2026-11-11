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

// Add a lead by hand. With a founder (name and LinkedIn link) it starts at "Founder found"; without one the extension finds the founder.
export async function addLead(input: {
  company: string; website: string; sector: string; hq: string; raised: string; companyUrl: string;
  founderName: string; founderTitle: string; founderUrl: string;
}): Promise<ActionResult<null>> {
  return guarded(async () => {
    const session = await getSession();
    if (!session.user || !session.who || !canOpen(session.who, "outreach")) throw new Error("You don't have access to this action");
    const clean = (u: string) => u.trim().split("?")[0].replace(/\/$/, "");
    const company = input.company.trim();
    const founderUrl = clean(input.founderUrl);
    const companyUrl = clean(input.companyUrl);
    const website = input.website.trim();
    if (company.length < 2) throw new Error("Add the company name");
    if (founderUrl && !LINKEDIN_PROFILE.test(founderUrl)) throw new Error("The founder's link should look like linkedin.com/in/…");
    if (companyUrl && !LINKEDIN_COMPANY.test(companyUrl)) throw new Error("The company's LinkedIn link should look like linkedin.com/company/…");
    if (website && !/^https?:\/\/\S+$/i.test(website)) throw new Error("The website should start with https://");
    if (!!input.founderName.trim() !== !!founderUrl) throw new Error("Give both the founder's name and LinkedIn link, or neither");

    const supabase = await createClient();
    const { error } = await supabase.rpc("outreach_add_lead", {
      p_company: company, p_website: website, p_hq: input.hq, p_sector: input.sector, p_raised: input.raised, p_company_url: companyUrl,
      p_founder_name: input.founderName, p_founder_title: input.founderTitle, p_founder_url: founderUrl,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/outreach");
    return null;
  });
}
