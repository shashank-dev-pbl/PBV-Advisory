import { createClient } from "@/lib/supabase/server";
import { istDayKey, mergeSettings, type Hit, type Lead, type LeadEvent, type Settings } from "@/lib/outreach";

// Server only: reads the outreach tables of the project this deployment is connected to, as the signed-in PBA staff member.
export type OutreachData =
  | { ok: true; leads: Lead[]; hits: Hit[]; events: LeadEvent[]; settings: Settings; today: { conn: number; msg: number }; pendingReplies: number }
  | { ok: false; detail: string };

const CONN_EVENTS = ["connection_sent"];
const MSG_EVENTS = ["dm_sent", "fu1_sent", "fu2_sent", "reply_sent"];

export async function loadOutreach(): Promise<OutreachData> {
  const supabase = await createClient();
  const dayStart = `${istDayKey(new Date())}T00:00:00+05:30`;
  const [leads, hits, events, cfg, today, outbox] = await Promise.all([
    supabase.from("outreach_queue").select("*").order("updated_at", { ascending: false }).limit(1000),
    supabase.from("outreach_source_hit").select("id, queue_id, source, url, title, found_on").order("found_on").limit(5000),
    supabase.from("outreach_event").select("id, at, queue_id, detail").not("detail", "is", null).order("at").limit(8000),
    supabase.rpc("outreach_config_get"),
    supabase.from("outreach_event").select("action_type").gte("at", dayStart).in("action_type", [...CONN_EVENTS, ...MSG_EVENTS]),
    supabase.from("outreach_outbox").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  const error = leads.error ?? hits.error ?? events.error ?? cfg.error ?? today.error;
  if (error) return { ok: false, detail: error.message };
  const acts = (today.data ?? []) as { action_type: string }[];
  return {
    ok: true,
    leads: (leads.data ?? []) as Lead[],
    hits: (hits.data ?? []) as Hit[],
    events: (events.data ?? []) as LeadEvent[],
    settings: mergeSettings(cfg.data),
    today: { conn: acts.filter((a) => CONN_EVENTS.includes(a.action_type)).length, msg: acts.filter((a) => MSG_EVENTS.includes(a.action_type)).length },
    pendingReplies: outbox.count ?? 0,
  };
}
