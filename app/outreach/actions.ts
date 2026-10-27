"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { canOpen } from "@/lib/access";
import { outreachConfig } from "@/lib/outreach";
import { guarded, type ActionResult } from "@/lib/actionResult";

// The one write on the Outreach page: give the bot the founder it could not find on its own. The lead moves to
// "Founder found" and the bot sends the connection request on its next round, the same as for a lead it found itself.
// Only leads sitting in Needs review or No founder found can be changed this way.
const LINKEDIN_PROFILE = /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[^\s/?#]+/i;
const LINKEDIN_COMPANY = /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/company\/[^\s/?#]+/i;
const FIXABLE = ["needs_review", "no_founder"];

export async function giveFounder(input: {
  id: number; founderUrl: string; founderName: string; founderTitle: string; companyUrl: string;
}): Promise<ActionResult<null>> {
  return guarded(async () => {
    const session = await getSession();
    if (!session.user || !session.who || !canOpen(session.who, "outreach")) throw new Error("You don't have access to this action");
    const cfg = outreachConfig();
    if (!cfg) throw new Error("Outreach is not connected on this deployment");
    const { base, key } = cfg;

    const founderUrl = input.founderUrl.trim().split("?")[0].replace(/\/$/, "");
    const founderName = input.founderName.trim();
    const founderTitle = input.founderTitle.trim();
    const companyUrl = input.companyUrl.trim().split("?")[0].replace(/\/$/, "");
    if (!LINKEDIN_PROFILE.test(founderUrl)) throw new Error("Paste the founder's LinkedIn profile link (linkedin.com/in/…)");
    if (founderName.length < 2) throw new Error("Add the founder's name, it is used in the message");
    if (companyUrl && !LINKEDIN_COMPANY.test(companyUrl)) throw new Error("The company link should look like linkedin.com/company/…");

    const headers = { "x-extension-key": key, "Content-Type": "application/json" };
    // Never trust an id from the browser: it must be a lead the page lists as fixable.
    const listRes = await fetch(`${base}/api/queue?stage=${FIXABLE.join(",")}&limit=200`, { headers, cache: "no-store" });
    const list = (await listRes.json()) as { items?: { id: number }[]; error?: string };
    if (!listRes.ok) throw new Error(list.error ?? "Could not reach the outreach app");
    if (!(list.items ?? []).some((i) => i.id === input.id)) throw new Error("This lead has already moved on");

    const res = await fetch(`${base}/api/queue/${input.id}`, {
      method: "PATCH",
      headers,
      cache: "no-store",
      body: JSON.stringify({
        stage: "founder_found",
        founder_url: founderUrl,
        founder_name: founderName,
        founder_title: founderTitle || null,
        ...(companyUrl ? { linkedin_company_url: companyUrl } : {}),
        last_error: null,
      }),
    });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Save failed (${res.status})`);
    revalidatePath("/outreach");
    return null;
  });
}
