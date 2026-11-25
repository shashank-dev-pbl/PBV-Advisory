import "server-only";
import { extensionDb } from "@/lib/outreachApi";
import { guessLabel, mergeSettings, type Cfg, type Lead } from "@/lib/outreach";
import { labelReply, writeHook } from "@/lib/outreachAi";

// The daily job: the part of the sequence that needs no LinkedIn. It pulls new rounds from Source 1, runs the ICP check,
// looks for the same round in the news feeds, moves a company to "Verified – to approve" once enough sources agree,
// writes the one-line company hook, and closes what has timed out. The extension does everything on LinkedIn.
//
// It talks to the database like the extension does: through the outreach_* functions with the shared key, which must be
// set on the deployment as OUTREACH_KEY (the same value given to outreach_set_key).

type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<unknown>;
export type ScanResult = { ok: boolean; notes: string[] };

const FEEDS: Record<string, string> = {
  s2: process.env.OUTREACH_FEED_S2 || "https://yourstory.com/feed",
  s3: process.env.OUTREACH_FEED_S3 || "https://inc42.com/feed/",
  s4: process.env.OUTREACH_FEED_S4 || "https://entrackr.com/feed",
};
const FUNDING_WORDS = /rais|fund|series|seed|round|invest|backed|led by|bags|secures|closes/i;
const DAY = 86400000;

const norm = (s: string) => ` ${s.toLowerCase().replace(/\b(pvt|private|ltd|limited|inc|llp|technologies|technology)\b\.?/g, "").replace(/[^a-z0-9]+/g, " ").trim()} `;
const strip = (s: string) => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#8217;|&rsquo;/g, "'").replace(/&#8211;|&ndash;/g, "–").replace(/&quot;/g, '"').replace(/&#?\w+;/g, " ").replace(/\s+/g, " ").trim();

type Item = { title: string; link: string; text: string; at: number };
function parseFeed(xml: string): Item[] {
  const out: Item[] = [];
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const b = m[0];
    const get = (tag: string) => b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"))?.[1] ?? "";
    const at = Date.parse(strip(get("pubDate")));
    out.push({ title: strip(get("title")), link: strip(get("link")), text: strip(get("content:encoded") || get("description")), at: Number.isFinite(at) ? at : Date.now() });
  }
  return out;
}

// "₹62 Cr", "Rs 9 crore", "$3.2M", "$11 million" -> crores of rupees. null when it cannot be read.
export function toCrore(text: string | null | undefined, usdInr: number): number | null {
  const v = amountsIn(text ?? "", usdInr);
  return v.length ? v[0] : null;
}
function amountsIn(text: string, usdInr: number): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(?:₹|rs\.?|inr)\s?([\d,]+(?:\.\d+)?)\s?(crore|cr|lakh|lakhs)\b/gi)) {
    const n = parseFloat(m[1].replace(/,/g, ""));
    out.push(/lakh/i.test(m[2]) ? n / 100 : n);
  }
  for (const m of text.matchAll(/\$\s?([\d,]+(?:\.\d+)?)\s?(million|mn|m|billion|bn|b|thousand|k)\b/gi)) {
    const n = parseFloat(m[1].replace(/,/g, ""));
    const usd = /^b/i.test(m[2]) ? n * 1e9 : /^(k|t)/i.test(m[2]) ? n * 1e3 : n * 1e6;
    out.push((usd * usdInr) / 1e7);
  }
  return out;
}

export function icpCheck(l: Pick<Lead, "round_name" | "round_amount" | "sector" | "announced_on">, c: Cfg): string | null {
  const stages = c.stages.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (l.round_name && stages.length && !stages.some((s) => l.round_name!.toLowerCase().includes(s) || s.includes(l.round_name!.toLowerCase()))) return `Round "${l.round_name}" is outside the funding stages we target`;
  const cr = toCrore(l.round_amount, c.usdInr);
  if (cr !== null && cr < c.minAmountCr) return `Round of ₹${cr.toFixed(1)} Cr is below the minimum of ₹${c.minAmountCr} Cr`;
  if (cr !== null && cr > c.maxAmountCr) return `Round of ₹${cr.toFixed(0)} Cr is above the maximum of ₹${c.maxAmountCr} Cr`;
  const skip = c.excludeSectors.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const hit = skip.find((s) => (l.sector ?? "").toLowerCase().includes(s));
  if (hit) return `Sector "${l.sector}" is on the exclude list`;
  if (l.announced_on && Date.now() - Date.parse(l.announced_on) > c.lookbackDays * DAY) return `Announced more than ${c.lookbackDays} days ago`;
  return null;
}

// Source 1: a CSV or JSON file at OUTREACH_SOURCE1_URL. Column names are matched loosely.
function parseTracker(text: string): Record<string, string>[] {
  const t = text.trim();
  let rows: Record<string, unknown>[] = [];
  if (t.startsWith("[") || t.startsWith("{")) {
    const j = JSON.parse(t);
    rows = Array.isArray(j) ? j : j.data ?? j.rows ?? j.items ?? [];
  } else {
    const lines = t.split(/\r?\n/).filter(Boolean);
    const split = (s: string) => [...s.matchAll(/("([^"]|"")*"|[^,]*)(,|$)/g)].map((m) => m[1].replace(/^"|"$/g, "").replace(/""/g, '"')).slice(0, -1);
    const head = split(lines[0]).map((h) => h.trim().toLowerCase());
    rows = lines.slice(1).map((ln) => Object.fromEntries(split(ln).map((v, i) => [head[i], v])));
  }
  const pick = (r: Record<string, unknown>, ...ks: string[]) => { for (const k of ks) { const v = r[k]; if (v !== undefined && v !== null && String(v).trim()) return String(v).trim(); } return ""; };
  return rows.map((r) => {
    const low = Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase(), v]));
    return {
      name: pick(low, "name", "company", "company_name", "startup"), website: pick(low, "website", "site", "domain"), city: pick(low, "city", "hq", "location", "headquarters"),
      sector: pick(low, "sector", "industry", "vertical"), round: pick(low, "round", "stage", "round_type", "funding_round"),
      amount: pick(low, "amount", "amount_text", "raised", "funding_amount"), lead_investor: pick(low, "lead_investor", "lead", "lead investor"),
      investors: pick(low, "investors", "investor"), description: pick(low, "description", "about", "what_they_do"),
      announced_on: pick(low, "announced_on", "announced", "date", "funding_date").slice(0, 10), url: pick(low, "url", "article_url", "source_url", "link"),
    };
  }).filter((r) => r.name);
}

async function fetchText(url: string, ms = 15000): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { "user-agent": "Mozilla/5.0 (compatible; PBA-Outreach/1.0)" } });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.text();
}

export async function runScan(): Promise<ScanResult> {
  const key = process.env.OUTREACH_KEY || process.env.OUTREACH_API_KEY;
  if (!key) return { ok: false, notes: ["OUTREACH_KEY is not set on this deployment. Use the same key the extension uses."] };
  const db = extensionDb();
  const rpc: Rpc = async (fn, args = {}) => {
    const { data, error } = await db.rpc(fn, { p_key: key, ...args });
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data;
  };
  const notes: string[] = [];
  const settings = mergeSettings((await rpc("outreach_config_for_bot")) as never);
  const c = settings.cfg;
  const patch = (id: number, p: Record<string, unknown>) => rpc("outreach_queue_patch", { p_id: id, p_patch: p });

  // 1. Source 1: new rounds
  const src = process.env.OUTREACH_SOURCE1_URL;
  if (!src) notes.push("Source 1 is not connected (OUTREACH_SOURCE1_URL is not set), so no new companies were discovered.");
  else {
    try {
      const rows = parseTracker(await fetchText(src, 30000)).slice(0, 300);
      const r = (await rpc("outreach_discover", { p_leads: rows })) as { added: number; received: number };
      notes.push(`Source 1: ${r.received} rows read, ${r.added} new.`);
    } catch (e) { notes.push(`Source 1 failed: ${(e as Error).message}`); }
  }

  // 2. ICP check and verification
  const pre = (await rpc("outreach_queue_list", { p_stages: ["discovered", "verifying"], p_limit: 200 })) as Lead[];
  let toVerifying = 0, excluded = 0, verified = 0, unverified = 0;
  for (const l of pre.filter((x) => x.stage === "discovered")) {
    const why = icpCheck(l, c);
    if (why) { await patch(l.id, { stage: "excluded", log: `Closed: outside ICP. ${why}.` }); excluded++; }
    else { await patch(l.id, { stage: "verifying", log: `ICP check passed. Warming period started (${c.warmingHours}h). Checking other sources.` }); toVerifying++; }
  }

  const verifying = pre.filter((x) => x.stage === "verifying").concat(pre.filter((x) => x.stage === "discovered" && !icpCheck(x, c)).map((x) => ({ ...x, stage_since: new Date().toISOString() })));
  if (verifying.length) {
    const feeds: Record<string, Item[]> = {};
    for (const [id, url] of Object.entries(FEEDS)) {
      try { feeds[id] = parseFeed(await fetchText(url)); } catch (e) { notes.push(`${id === "s2" ? "YourStory" : id === "s3" ? "Inc42" : "Entrackr"} feed failed: ${(e as Error).message}`); }
    }
    for (const l of verifying) {
      const name = norm(l.company_name);
      const ref = l.announced_on ? Date.parse(l.announced_on) : Date.parse(l.created_at);
      let count = 0;
      for (const [id, items] of Object.entries(feeds)) {
        const m = items.find((it) => norm(it.title).includes(name) && FUNDING_WORDS.test(`${it.title} ${it.text}`) && Math.abs(it.at - ref) <= 21 * DAY);
        if (!m) continue;
        const mine = toCrore(l.round_amount, c.usdInr);
        const theirs = amountsIn(`${m.title} ${m.text}`, c.usdInr);
        if (mine !== null && theirs.length && !theirs.some((t) => Math.abs(t - mine) / mine <= 0.15)) {
          await patch(l.id, { last_error: `An article on ${id === "s2" ? "YourStory" : id === "s3" ? "Inc42" : "Entrackr"} shows a different amount (${theirs.map((t) => `₹${t.toFixed(1)} Cr`).join(", ")}). Check by hand.` });
          continue;
        }
        count = (await rpc("outreach_source_hit_add", { p_queue_id: l.id, p_source: id, p_url: m.link, p_title: m.title, p_text: `${m.title}\n${m.text}` })) as number;
      }
      if (!count) count = (await rpc("outreach_source_hit_add", { p_queue_id: l.id, p_source: "s1", p_url: null, p_title: null, p_text: "" })) as number;
      const hours = (Date.now() - Date.parse(l.stage_since)) / 3600000;
      if (count >= c.minSources && hours >= c.warmingHours) {
        await patch(l.id, { stage: "ready", verified_at: new Date().toISOString(), log: `Verified by ${count} sources. ${c.requireApproval ? "Waiting for approval." : "Queued for sending."}` });
        verified++;
        const hits = (await rpc("outreach_source_hits", { p_ids: [l.id] })) as { article_text: string | null }[];
        const hook = await writeHook(settings.prompt, { company: l.company_name, description: l.description, sector: l.sector, round: l.round_name, amount: l.round_amount, investors: l.investors, articles: hits.map((h) => h.article_text ?? "").filter(Boolean) });
        if (hook) await patch(l.id, { hook, log: "AI line written from the articles" });
      } else if ((Date.now() - Date.parse(l.stage_since)) / DAY >= c.maxVerifyDays) {
        await patch(l.id, { stage: "unverified", log: `Only ${count} source(s) after ${c.maxVerifyDays} days. Closed – not contacted.` });
        unverified++;
      }
    }
  }
  notes.push(`Checked ${pre.length} companies: ${toVerifying} passed the ICP check, ${excluded} excluded, ${verified} verified, ${unverified} closed as unverified.`);

  // 3. Timeouts and reply labels
  const live = (await rpc("outreach_queue_list", { p_stages: ["conn_sent", "fu2", "replied"], p_limit: 200 })) as Lead[];
  let expired = 0, quiet = 0, labelled = 0;
  for (const l of live) {
    if (l.stage === "conn_sent" && l.connect_sent_at && Date.now() - Date.parse(l.connect_sent_at) >= c.acceptWaitDays * DAY) {
      await patch(l.id, { stage: "expired", log: `Not accepted in ${c.acceptWaitDays} days – closed` }); expired++;
    } else if (l.stage === "fu2" && l.fu2_sent_at && Date.now() - Date.parse(l.fu2_sent_at) >= c.closeDays * DAY) {
      await patch(l.id, { stage: "no_response", log: "No reply after full sequence – closed" }); quiet++;
    } else if (l.stage === "replied" && l.reply_text && !l.reply_label) {
      const label = (await labelReply("Classify the founder's reply into one of: Interested, Asking for info, Referral, Not now, Not interested, Unclear. Return the label and one short reason. Never send anything. The label only sorts Swetha's queue.", l.reply_text)) ?? guessLabel(l.reply_text);
      await patch(l.id, { reply_label: label }); labelled++;
    }
  }
  if (expired || quiet || labelled) notes.push(`Closed ${expired} unaccepted invites and ${quiet} with no reply; labelled ${labelled} replies.`);
  return { ok: true, notes };
}
