"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { canOpen } from "@/lib/access";
import { guarded, type ActionResult } from "@/lib/actionResult";
import { MESSAGE_KEYS, REPLY_LABELS, guessLabel, mergeSettings, msgFor, type Cfg, type Lead, type Templates } from "@/lib/outreach";
import { aiConfigured, draftReply, labelReply, writeHook } from "@/lib/outreachAi";
import { runScan } from "@/lib/outreachEngine";

// Everything here is for signed-in PBA staff. The database functions check that again; this just gives a plain refusal.
const LINKEDIN_PROFILE = /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[^\s/?#]+/i;
const LINKEDIN_COMPANY = /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/company\/[^\s/?#]+/i;
const clean = (u: string) => u.trim().split("?")[0].replace(/\/$/, "");

async function staff() {
  const session = await getSession();
  if (!session.user || !session.who || !canOpen(session.who, "outreach")) throw new Error("You don't have access to this action");
  return createClient();
}
const refresh = () => revalidatePath("/outreach", "layout");

// Give the extension the founder it could not find. The lead stays where it is; once approved it is contacted.
export async function giveFounder(input: { id: number; founderUrl: string; founderName: string; founderTitle: string; companyUrl: string }): Promise<ActionResult<null>> {
  return guarded(async () => {
    const supabase = await staff();
    const founderUrl = clean(input.founderUrl);
    const companyUrl = clean(input.companyUrl);
    if (!LINKEDIN_PROFILE.test(founderUrl)) throw new Error("Paste the founder's LinkedIn profile link (linkedin.com/in/…)");
    if (input.founderName.trim().length < 2) throw new Error("Add the founder's name, it is used in the message");
    if (companyUrl && !LINKEDIN_COMPANY.test(companyUrl)) throw new Error("The company link should look like linkedin.com/company/…");
    const { error } = await supabase.rpc("outreach_give_founder", {
      p_id: input.id, p_founder_url: founderUrl, p_founder_name: input.founderName.trim(), p_founder_title: input.founderTitle.trim(), p_company_url: companyUrl,
    });
    if (error) throw new Error(error.message);
    refresh();
    return null;
  });
}

// Fill in or correct the round details of a company (messages with an empty field are never sent, so older leads need this).
export async function setRound(input: { id: number; round: string; amount: string; leadInvestor: string; description: string }): Promise<ActionResult<null>> {
  return guarded(async () => {
    const supabase = await staff();
    if (!input.round.trim() && !input.amount.trim() && !input.leadInvestor.trim() && !input.description.trim()) throw new Error("Fill in at least one field");
    const { error } = await supabase.rpc("outreach_set_round", {
      p_id: input.id, p_round: input.round, p_amount: input.amount, p_lead_investor: input.leadInvestor, p_description: input.description,
    });
    if (error) throw new Error(error.message);
    refresh();
    return null;
  });
}

// Add a lead by hand. It skips verification and waits in "Verified – to approve".
export type AddLeadInput = {
  company: string; website: string; sector: string; hq: string; companyUrl: string; round: string; amount: string; leadInvestor: string; description: string;
  founderName: string; founderTitle: string; founderUrl: string;
};
export async function addLead(input: AddLeadInput): Promise<ActionResult<null>> {
  return guarded(async () => {
    const supabase = await staff();
    const founderUrl = clean(input.founderUrl);
    const companyUrl = clean(input.companyUrl);
    const website = input.website.trim();
    if (input.company.trim().length < 2) throw new Error("Add the company name");
    if (founderUrl && !LINKEDIN_PROFILE.test(founderUrl)) throw new Error("The founder's link should look like linkedin.com/in/…");
    if (companyUrl && !LINKEDIN_COMPANY.test(companyUrl)) throw new Error("The company's LinkedIn link should look like linkedin.com/company/…");
    if (website && !/^https?:\/\/\S+$/i.test(website)) throw new Error("The website should start with https://");
    if (!!input.founderName.trim() !== !!founderUrl) throw new Error("Give both the founder's name and LinkedIn link, or neither");
    const { error } = await supabase.rpc("outreach_add_lead", {
      p_company: input.company, p_website: website, p_hq: input.hq, p_sector: input.sector, p_company_url: companyUrl,
      p_founder_name: input.founderName, p_founder_title: input.founderTitle, p_founder_url: founderUrl,
      p_round: input.round, p_amount: input.amount, p_lead_investor: input.leadInvestor, p_description: input.description,
    });
    if (error) throw new Error(error.message);
    refresh();
    return null;
  });
}

// Approve, pause, exclude, close, queue a reply … the staff actions on a lead. See outreach_act in the database.
export async function act(action: string, id: number, args: Record<string, unknown> = {}): Promise<ActionResult<{ count?: number; id?: number }>> {
  return guarded(async () => {
    const supabase = await staff();
    const { data, error } = await supabase.rpc("outreach_act", { p_action: action, p_id: id, p_args: args });
    if (error) throw new Error(error.message);
    refresh();
    return (data ?? {}) as { count?: number; id?: number };
  });
}

// Rules, the four messages and the AI instruction. Each screen saves only its own part; the rest is kept as it is in the database.
export async function saveSettings(patch: { cfg?: Cfg; tpl?: Templates; prompt?: string }): Promise<ActionResult<null>> {
  return guarded(async () => {
    const supabase = await staff();
    const current = await supabase.rpc("outreach_config_get");
    if (current.error) throw new Error(current.error.message);
    const base = mergeSettings(current.data);
    const cfg = patch.cfg ?? base.cfg;
    const tpl = patch.tpl ?? base.tpl;
    const prompt = patch.prompt ?? base.prompt;
    const nums: (keyof Cfg)[] = ["minSources", "warmingHours", "maxVerifyDays", "acceptWaitDays", "m1DelayDays", "f1Days", "f2Days", "closeDays", "connCap", "msgCap", "sendFrom", "sendTo", "gapMinSec", "gapMaxSec", "minAmountCr", "maxAmountCr", "usdInr", "lookbackDays"];
    for (const k of nums) if (!Number.isFinite(cfg[k] as number) || (cfg[k] as number) < 0) throw new Error(`"${k}" must be a number, zero or more`);
    if (cfg.minSources < 1) throw new Error("At least one source must confirm a round");
    if (cfg.connCap > 25) throw new Error("More than 25 connection requests a day risks the LinkedIn account");
    if (cfg.sendTo <= cfg.sendFrom || cfg.sendTo > 24) throw new Error("The sending window must end after it starts (hours 0 to 24, India time)");
    if (cfg.gapMaxSec < cfg.gapMinSec) throw new Error("The longest gap between actions must be at least the shortest");
    for (const k of MESSAGE_KEYS) if (!tpl[k].body.trim()) throw new Error(`${tpl[k].name} cannot be empty`);
    const { error } = await supabase.rpc("outreach_config_save", { p_config: cfg, p_templates: tpl, p_hook_prompt: prompt });
    if (error) throw new Error(error.message);
    refresh();
    return null;
  });
}

async function leadWithSettings(id: number) {
  const supabase = await staff();
  const [lead, cfg] = await Promise.all([supabase.from("outreach_queue").select("*").eq("id", id).single(), supabase.rpc("outreach_config_get")]);
  if (lead.error) throw new Error(lead.error.message);
  return { supabase, lead: lead.data as Lead, settings: mergeSettings(cfg.data) };
}

// Write the one line about the company from the articles that confirmed the round, and save it on the lead.
export async function aiHook(id: number): Promise<ActionResult<string>> {
  return guarded(async () => {
    if (!aiConfigured()) throw new Error("The AI is not set up on this deployment (ANTHROPIC_API_KEY). Write the line by hand.");
    const { supabase, lead, settings } = await leadWithSettings(id);
    const { data: hits } = await supabase.from("outreach_source_hit").select("title, url").eq("queue_id", id);
    const line = await writeHook(settings.prompt, {
      company: lead.company_name, description: lead.description, sector: lead.sector, round: lead.round_name, amount: lead.round_amount, investors: lead.investors,
      articles: (hits ?? []).map((h: { title: string | null }) => h.title ?? "").filter(Boolean),
    });
    if (line === null) throw new Error("The AI did not answer. Try again, or write the line by hand.");
    const { error } = await supabase.rpc("outreach_act", { p_action: "set_hook", p_id: id, p_args: { text: line, ai: true } });
    if (error) throw new Error(error.message);
    refresh();
    return line;
  });
}

// A suggested reply for Swetha to edit. The AI never sends anything; "Send reply" queues the text for the extension.
export async function aiDraft(id: number): Promise<ActionResult<{ text: string; label: string }>> {
  return guarded(async () => {
    const { lead, settings } = await leadWithSettings(id);
    if (!lead.reply_text) throw new Error("There is no reply to answer");
    const label = lead.reply_label || (await labelReply("Classify the founder's reply into one of: " + REPLY_LABELS.join(", "), lead.reply_text)) || guessLabel(lead.reply_text);
    const first = (lead.founder_name ?? "").replace(/^Dr\.?\s*/i, "").split(" ")[0] || "there";
    const ai = await draftReply(lead.company_name, lead.founder_name ?? "", label, lead.reply_text, msgFor(lead, "m1", settings));
    const fallback: Record<string, string> = {
      Interested: `Thanks ${first}. Does Thursday at 3 pm suit you for a 20-minute call? I'll send a calendar invite with a short agenda.`,
      "Asking for info": `Thanks ${first}. We usually start with a one-time onboarding of your numbers, then a monthly retainer. Easier to explain on a 20-minute call. Would Thursday or Friday work?`,
      Referral: `Thanks ${first}, appreciate it. Could you share their LinkedIn or email? I'll reach out directly.`,
      "Not now": `Understood, ${first}. I'll check back in a few months. Good luck with the plans for the ${lead.round_name ?? "round"}.`,
      "Not interested": `No problem, ${first}. All the best.`,
    };
    return { text: ai ?? fallback[label] ?? `Thanks ${first}.`, label };
  });
}

// Run the daily scan now instead of waiting for the schedule.
export async function scanNow(): Promise<ActionResult<{ ok: boolean; notes: string[] }>> {
  return guarded(async () => {
    await staff();
    const r = await runScan();
    refresh();
    return r;
  });
}
