import type { SupabaseClient } from "@supabase/supabase-js";

// The external practitioner's firm for a company — shown on the dashboard footer and the monthly line.
// Read from the people record, never hardcoded, so a different firm on another company shows its own name.
export async function externalFirmName(supabase: SupabaseClient, companyId: string): Promise<string> {
  const { data } = await supabase
    .from("app_user")
    .select("firm_name")
    .eq("company_id", companyId)
    .eq("role", "practitioner")
    .not("firm_name", "is", null)
    .limit(1)
    .maybeSingle();
  return data?.firm_name ?? "The external practitioner";
}
