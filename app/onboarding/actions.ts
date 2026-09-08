"use server";

import { createClient } from "@/lib/supabase/server";

export async function completeOnboarding(name: string, position: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_own_profile", { p_name: name, p_position: position });
  if (error) throw error;
  return data;
}
