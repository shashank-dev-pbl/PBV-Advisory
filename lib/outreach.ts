// Advisory outreach: the leads the LinkedIn extension works through, kept in this project's own database
// (outreach_queue). Each deployment reads its own project, so dev and prod never share a lead.
import { createClient } from "@/lib/supabase/server";

export type OutreachItem = {
  id: number;
  company_name: string;
  website: string | null;
  hq: string | null;
  sector: string | null;
  total_raised_text: string | null;
  stage: string;
  linkedin_company_url: string | null;
  founder_name: string | null;
  founder_title: string | null;
  founder_url: string | null;
  founder_candidates: { name: string; url: string; title: string | null; degree: string | null }[] | null;
  connect_sent_at: string | null;
  accepted_at: string | null;
  dm_sent_at: string | null;
  replied_at: string | null;
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

// Funnel order, with the plain word shown for each stage the bot writes.
export const FUNNEL = ["new", "founder_found", "connect_sent", "accepted", "dm_sent", "replied"] as const;
// Can't connect and Skipped are left out on purpose: not wanted on this page.
export const SIDE_EXITS = ["needs_review", "no_founder", "stale"] as const;

// Status wording from the brief (BOT_OUTREACH_LOG): Scanning, Requested, Accepted - Awaiting Message,
// Message Sent, Replied - Handed to Team, No Response. The bot's own stages map onto them.
export const STAGE_LABEL: Record<string, string> = {
  new: "Scanning",
  founder_found: "Scanning",
  connect_sent: "Requested",
  accepted: "Accepted - Awaiting Message",
  dm_sent: "Message Sent",
  replied: "Replied - Handed to Team",
  needs_review: "Needs review",
  no_founder: "No founder found",
  cannot_connect: "Can't connect",
  stale: "No Response",
  skipped: "Skipped",
};

export type OutreachResult =
  | { ok: true; counts: Record<string, number>; items: OutreachItem[] }
  | { ok: false; reason: "failed"; detail?: string };

export async function loadOutreach(stages: string[]): Promise<OutreachResult> {
  const supabase = await createClient();
  const [counts, items] = await Promise.all([
    supabase.rpc("outreach_stage_counts"),
    supabase.from("outreach_queue").select("*").in("stage", stages).order("updated_at", { ascending: false }).limit(200),
  ]);
  const error = counts.error ?? items.error;
  if (error) return { ok: false, reason: "failed", detail: error.message };
  const byStage: Record<string, number> = {};
  for (const r of (counts.data ?? []) as { stage: string; n: number }[]) byStage[r.stage] = Number(r.n);
  return { ok: true, counts: byStage, items: (items.data ?? []) as OutreachItem[] };
}

// The date that matters most for where the lead is now.
export function lastMove(i: OutreachItem): string {
  return i.replied_at ?? i.dm_sent_at ?? i.accepted_at ?? i.connect_sent_at ?? i.updated_at;
}

// Sample leads covering every stage, for looking at the page without touching the bot's live queue.
// Opened with /outreach?demo=1. Nothing here is read from or written to the bot's app.
export function demoOutreach(stages: string[]): OutreachResult {
  const at = (daysAgo: number, h = 11) => {
    const d = new Date(Date.now() - daysAgo * 86400000);
    d.setUTCHours(h, 30, 0, 0);
    return d.toISOString();
  };
  const base = { website: null, linkedin_company_url: "https://www.linkedin.com/company/sample", founder_url: "https://www.linkedin.com/in/sample", founder_candidates: null, attempts: 0, last_error: null } as const;
  const mk = (id: number, stage: string, name: string, f: Partial<OutreachItem> = {}): OutreachItem => ({
    ...base, id, stage, company_name: name, hq: "Bengaluru", sector: "SaaS", total_raised_text: "$2.5M",
    founder_name: "Asha Rao", founder_title: "Co-Founder & CEO",
    connect_sent_at: null, accepted_at: null, dm_sent_at: null, replied_at: null,
    created_at: at(12), updated_at: at(12), ...f,
  });
  const all: OutreachItem[] = [
    mk(1, "new", "Sample Queued Co", { founder_name: null, founder_title: null, founder_url: null, linkedin_company_url: null, updated_at: at(0) }),
    mk(2, "founder_found", "Sample Found Co", { updated_at: at(1), founder_candidates: [
      { name: "Asha Rao", url: "https://www.linkedin.com/in/sample", title: "Co-Founder & CEO", degree: "2nd" },
      { name: "Vikram Shah", url: "https://www.linkedin.com/in/sample2", title: "CFO", degree: "3rd" },
    ] }),
    mk(3, "connect_sent", "Sample Requested Co", { connect_sent_at: at(3), updated_at: at(3) }),
    mk(4, "accepted", "Sample Accepted Co", { connect_sent_at: at(5), accepted_at: at(2), updated_at: at(2) }),
    mk(5, "dm_sent", "Sample Messaged Co", { connect_sent_at: at(8), accepted_at: at(6), dm_sent_at: at(6, 14), updated_at: at(6, 14) }),
    mk(6, "replied", "Sample Replied Co", { connect_sent_at: at(10), accepted_at: at(8), dm_sent_at: at(8, 14), replied_at: at(1, 16), updated_at: at(1, 16) }),
    mk(7, "needs_review", "Sample Unclear Co", { founder_name: null, founder_title: null, founder_url: null, linkedin_company_url: null, last_error: "No confident LinkedIn company match. Closest: Sample Unclear Technologies, Unclear Co India" }),
    mk(8, "no_founder", "Sample No-Founder Co", { founder_name: null, founder_title: null, founder_url: null, last_error: "No founder/CEO found on LinkedIn" }),
    mk(9, "cannot_connect", "Sample Blocked Co", { attempts: 3, last_error: "Connect button not available on this profile" }),
    mk(10, "stale", "Sample Silent Co", { connect_sent_at: at(40), updated_at: at(10), last_error: "No acceptance after 30 days" }),
    mk(11, "skipped", "Sample Existing Co", { last_error: "Already in Founders table" }),
  ];
  const counts: Record<string, number> = {};
  for (const i of all) counts[i.stage] = (counts[i.stage] ?? 0) + 1;
  return { ok: true, counts, items: all.filter((i) => stages.includes(i.stage)) };
}
