// Advisory outreach: the funding-signal sequence from the approved prototype, kept in this project's own database
// (outreach_queue and friends). Each deployment reads its own project, so dev and prod never share a lead.
// Client-safe: no server imports here.

export type Lead = {
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
  fu1_sent_at: string | null;
  fu2_sent_at: string | null;
  replied_at: string | null;
  verified_at: string | null;
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  stage_since: string;
  round_name: string | null;
  round_amount: string | null;
  lead_investor: string | null;
  investors: string | null;
  description: string | null;
  announced_on: string | null;
  hook: string | null;
  approved: boolean;
  paused: boolean;
  already_first: boolean;
  flag: "needs_review" | "no_founder" | null;
  reply_text: string | null;
  reply_label: string | null;
  overrides: Record<string, string>;
  referred_from: number | null;
};

export type Hit = { id: number; queue_id: number; source: string; url: string | null; title: string | null; found_on: string };
export type LeadEvent = { id: number; at: string; queue_id: number | null; detail: string | null };

// ---- stages --------------------------------------------------------------------------------------------------------
export type StageGroup = "verify" | "outreach" | "human";
export const STAGES: { id: string; label: string; group: StageGroup; hint: string }[] = [
  { id: "discovered", label: "Discovered", group: "verify", hint: "Found in Source 1. ICP check runs next." },
  { id: "verifying", label: "Verifying (warming)", group: "verify", hint: "Waiting for other sources to confirm." },
  { id: "ready", label: "Verified – to approve", group: "verify", hint: "Approve before anything is sent." },
  { id: "conn_sent", label: "Connection sent", group: "outreach", hint: "Invite with short note." },
  { id: "connected", label: "Connected", group: "outreach", hint: "Message 1 goes after the delay." },
  { id: "msg1", label: "Message 1 sent", group: "outreach", hint: "Waiting for reply." },
  { id: "fu1", label: "Follow-up 1 sent", group: "outreach", hint: "" },
  { id: "fu2", label: "Follow-up 2 sent", group: "outreach", hint: "Last message in sequence." },
  { id: "replied", label: "Replied → Swetha", group: "human", hint: "Automation stops. Manual from here." },
  { id: "interested", label: "Interested / call", group: "human", hint: "Hand-off to advisory pipeline." },
];
export const CLOSED: Record<string, string> = {
  excluded: "Excluded (outside ICP / duplicate)",
  unverified: "Could not verify",
  expired: "Connection not accepted",
  no_response: "No reply after full sequence",
  not_interested: "Not interested",
  nurture: "Not now – nurture",
};
export const STAGE_LABEL: Record<string, string> = Object.fromEntries([...STAGES.map((s) => [s.id, s.label]), ...Object.entries(CLOSED)]);
export const isActive = (l: Lead) => STAGES.some((s) => s.id === l.stage);
export const GROUP_COLOUR: Record<StageGroup, string> = { verify: "#b9a26a", outreach: "#1f4e79", human: "#2d7a4c" };

// ---- sources -------------------------------------------------------------------------------------------------------
export const SOURCES = [
  { id: "s1", name: "Open-source funding tracker", role: "Discovery (Source 1)", method: "Daily pull of the public dataset (repo / API / CSV). Set OUTREACH_SOURCE1_URL on the deployment.", weight: "Required" },
  { id: "s2", name: "YourStory", role: "Verification", method: "Funding news section – RSS + article parse", weight: "Counts toward verification" },
  { id: "s3", name: "Inc42", role: "Verification", method: "Funding Galore / news – RSS + article parse", weight: "Counts toward verification" },
  { id: "s4", name: "Entrackr", role: "Verification", method: "Funding reports – RSS + article parse", weight: "Counts toward verification" },
  { id: "s5", name: "Company / investor post", role: "Verification", method: "Press release, company or lead investor LinkedIn post. Confirmed by hand on the company.", weight: "Counts toward verification" },
];
export const sourceName = (id: string) => SOURCES.find((s) => s.id === id)?.name ?? (id === "manual" ? "Added by hand" : id === "import" ? "Funding dashboard import" : id);

// ---- rules, messages, the AI instruction (defaults from the prototype) --------------------------------------------
export type Cfg = {
  minSources: number; warmingHours: number; maxVerifyDays: number; requireApproval: boolean;
  acceptWaitDays: number; m1DelayDays: number; f1Days: number; f2Days: number; closeDays: number;
  connCap: number; msgCap: number; sendFrom: number; sendTo: number; gapMinSec: number; gapMaxSec: number;
  stages: string; geo: string; minAmountCr: number; maxAmountCr: number; usdInr: number;
  excludeSectors: string; lookbackDays: number; roles: string;
};
export const DEFAULT_CFG: Cfg = {
  minSources: 2, warmingHours: 48, maxVerifyDays: 7, requireApproval: true,
  acceptWaitDays: 14, m1DelayDays: 1, f1Days: 4, f2Days: 7, closeDays: 7,
  connCap: 15, msgCap: 30, sendFrom: 10, sendTo: 19, gapMinSec: 180, gapMaxSec: 660,
  stages: "Pre-seed, Seed, Pre-Series A, Series A, Series B", geo: "India (HQ)", minAmountCr: 4, maxAmountCr: 400, usdInr: 88,
  excludeSectors: "Crypto, Real-money gaming", lookbackDays: 30, roles: "Founder, Co-founder, CEO, CFO",
};

export type Tpl = { name: string; when: string; limit?: number; body: string };
export type Templates = Record<"note" | "m1" | "f1" | "f2", Tpl>;
export const MESSAGE_KEYS = ["note", "m1", "f1", "f2"] as const;
export const DEFAULT_TPL: Templates = {
  note: { name: "Connection request note", when: "Sent with the invite", limit: 300,
    body: "Hi {{first_name}}, congratulations on {{company}}'s {{round}}. I run Prime Bottomline Advisory – we work with funded founders on finance and capital strategy. Would be good to connect." },
  m1: { name: "Message 1", when: "{{m1DelayDays}} day after connection accepted",
    body: "Thanks for connecting, {{first_name}}.\n\nSaw the {{amount}} {{round}} led by {{lead_investor}}. {{hook}}\n\nThe months after a raise are when finance usually gets stretched – investor reporting, monthly MIS, compliance, runway planning for the next round. We work as a fractional CFO team for founders at this stage, alongside your existing CA.\n\nOpen to a 20-minute call next week?\n\nSwetha\nCo-founder, Prime Bottomline Advisory" },
  f1: { name: "Follow-up 1", when: "{{f1Days}} days after Message 1, if no reply",
    body: "Hi {{first_name}}, following up on my note. If it helps, I can share the post-raise finance checklist we use with founders – monthly MIS, board pack, runway tracker and compliance calendar. Happy to send it over." },
  f2: { name: "Follow-up 2", when: "{{f2Days}} days after Follow-up 1, if no reply",
    body: "Hi {{first_name}}, last note from me. If finance support isn't a priority right now, no problem – I'll check back after your next board cycle. All the best with the {{round}}." },
};
export const DEFAULT_PROMPT = `You write one line (max 22 words) about a startup that has just raised funding.
Input: company description, sector, round, amount, investors, and the text of the news articles that verified the round.
Rules:
- One concrete fact from the articles: what they will use the money for, a number, a market, a product.
- No praise words (amazing, impressive, exciting). No questions. No emojis.
- Must read like Swetha wrote it herself. Plain English.
- If the articles give nothing specific, return an empty string – the template still works without it.
Output: the line only.`;
export const REPLY_LABELS = ["Interested", "Asking for info", "Referral", "Not now", "Not interested", "Unclear"] as const;
export const REPLY_PROMPT = `Classify the founder's reply into one of: ${REPLY_LABELS.join(", ")}.
Return the label and one short reason. Never send anything. The label only sorts Swetha's queue.`;

export type Settings = { cfg: Cfg; tpl: Templates; prompt: string };
// What is saved is merged over the defaults, so a setting added later never arrives empty.
export function mergeSettings(raw: { config?: Partial<Cfg> | null; templates?: Partial<Templates> | null; hook_prompt?: string | null } | null): Settings {
  const tpl = { ...DEFAULT_TPL } as Templates;
  for (const k of MESSAGE_KEYS) tpl[k] = { ...DEFAULT_TPL[k], ...(raw?.templates?.[k] ?? {}) };
  return { cfg: { ...DEFAULT_CFG, ...(raw?.config ?? {}) }, tpl, prompt: raw?.hook_prompt || DEFAULT_PROMPT };
}

// ---- message text --------------------------------------------------------------------------------------------------
export function varsOf(l: Lead, c: Cfg): Record<string, string | number> {
  const f = (l.founder_name ?? "").replace(/^Dr\.?\s*/i, "").split(" ")[0] ?? "";
  return {
    first_name: f, full_name: l.founder_name ?? "", company: l.company_name, round: l.round_name ?? "", amount: l.round_amount ?? "",
    lead_investor: l.lead_investor ?? "", investors: l.investors ?? "", sector: l.sector ?? "", city: l.hq ?? "", hook: l.hook ?? "",
    m1DelayDays: c.m1DelayDays, f1Days: c.f1Days, f2Days: c.f2Days,
  };
}
export function renderTpl(body: string, l: Lead, c: Cfg): string {
  const v = varsOf(l, c);
  return body.replace(/\{\{(\w+)\}\}/g, (m, k) => (v[k] !== undefined ? String(v[k]) : m)).replace(/ +\n/g, "\n").replace(/ {2,}/g, " ").trim();
}
export function msgFor(l: Lead, key: keyof Templates, s: Settings): string {
  return l.overrides?.[key] ?? renderTpl(s.tpl[key].body, l, s.cfg);
}
// The fields a message needs that this lead does not have. The extension refuses to send a message with a hole in it.
export function missingFor(l: Lead, key: keyof Templates, s: Settings): string[] {
  if (l.overrides?.[key] !== undefined) return /\{\{\w+\}\}/.test(l.overrides[key]) ? ["unfilled {{field}}"] : [];
  const v = varsOf(l, s.cfg);
  const used = [...new Set([...s.tpl[key].body.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))];
  return used.filter((k) => k !== "hook" && !k.endsWith("Days") && (v[k] === undefined || String(v[k]).trim() === ""));
}

// Every field any of the four messages needs that this company does not have yet. Empty = safe to approve.
export function missingAll(l: Lead, s: Settings): string[] {
  return [...new Set(MESSAGE_KEYS.flatMap((k) => missingFor(l, k, s)))];
}

// ---- dates (shown in IST, Indian format) ---------------------------------------------------------------------------
export const IST = "Asia/Kolkata";
export const fmtDay = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: IST }) : "–");
export const fmtDayLong = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: IST });
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: IST }).toUpperCase();
export const daysSince = (iso: string | null | undefined, now = Date.now()) => (iso ? Math.max(0, Math.floor((now - Date.parse(iso)) / 86400000)) : 0);
export const istDayKey = (d: Date | string) => new Date(d).toLocaleDateString("en-CA", { timeZone: IST });

// ---- funnel --------------------------------------------------------------------------------------------------------
export function funnelOf(leads: Lead[]) {
  const n = (f: (l: Lead) => boolean) => leads.filter(f).length;
  return {
    discovered: leads.length,
    verified: n((l) => !!l.verified_at),
    conn: n((l) => !!l.connect_sent_at),
    accepted: n((l) => !!l.accepted_at),
    msg1: n((l) => !!l.dm_sent_at),
    replied: n((l) => !!l.replied_at),
    interested: n((l) => l.stage === "interested"),
  };
}
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) + "%" : "–");

export const REPLY_TAG: Record<string, "good" | "acc" | "warn" | "bad" | ""> = {
  Interested: "good", "Asking for info": "acc", Referral: "acc", "Not now": "warn", "Not interested": "bad",
};

// The portal's own reading of a reply, used when no AI is set up: keyword rules, deliberately conservative.
export function guessLabel(text: string): string {
  const t = text.toLowerCase();
  if (/not interested|no thanks|not looking|unsubscribe|don'?t contact/.test(t)) return "Not interested";
  if (/not the right person|speak to|reach out to|talk to our|connect you with/.test(t)) return "Referral";
  if (/not right now|not now|maybe later|after q\d|next quarter|few months|bad timing/.test(t)) return "Not now";
  if (/what do you charge|pricing|how much|details|send (me|us|across)|more info|how do you/.test(t)) return "Asking for info";
  if (/can we (talk|speak|catch)|let'?s (talk|speak|connect)|call|thursday|friday|tomorrow|this week|interested|sounds good|yes/.test(t)) return "Interested";
  return "Unclear";
}

// Is this lead missing what the extension needs before it can contact them?
export function needsFounder(l: Lead): boolean {
  return !l.founder_url || !l.founder_name;
}
