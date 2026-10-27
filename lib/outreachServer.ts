import { createClient } from "@/lib/supabase/server";
import type { OutreachItem, OutreachResult } from "@/lib/outreach";

// Server only: reads the outreach tables of the project this deployment is connected to.
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
