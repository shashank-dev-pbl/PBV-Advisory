// Read-only view of the LinkedIn bot's queue. The bot (pbv-linkedin-bot) and its app own this data;
// the portal only reads it, server-side, with the same shared key the extension uses. The key never
// reaches the browser.

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
export const SIDE_EXITS = ["needs_review", "no_founder", "cannot_connect", "stale", "skipped"] as const;

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
  | { ok: false; reason: "not_configured" | "failed"; detail?: string };

async function call<T>(path: string): Promise<T> {
  const base = process.env.OUTREACH_API_URL!.replace(/\/$/, "");
  const res = await fetch(`${base}${path}`, {
    headers: { "x-extension-key": process.env.OUTREACH_API_KEY! },
    cache: "no-store",
  });
  if (!(res.headers.get("content-type") ?? "").includes("application/json")) throw new Error(`Unexpected reply (status ${res.status})`);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json as T;
}

export async function loadOutreach(stages: string[]): Promise<OutreachResult> {
  if (!process.env.OUTREACH_API_URL || !process.env.OUTREACH_API_KEY) return { ok: false, reason: "not_configured" };
  try {
    const [{ counts }, { items }] = await Promise.all([
      call<{ counts: Record<string, number> }>("/api/queue?summary=1"),
      call<{ items: OutreachItem[] }>(`/api/queue?stage=${encodeURIComponent(stages.join(","))}&limit=200`),
    ]);
    return { ok: true, counts, items };
  } catch (e) {
    return { ok: false, reason: "failed", detail: e instanceof Error ? e.message : String(e) };
  }
}

// The date that matters most for where the lead is now.
export function lastMove(i: OutreachItem): string {
  return i.replied_at ?? i.dm_sent_at ?? i.accepted_at ?? i.connect_sent_at ?? i.updated_at;
}
