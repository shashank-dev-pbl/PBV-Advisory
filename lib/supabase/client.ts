import { createBrowserClient } from "@supabase/ssr";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { COMPANY_COOKIE } from "@/lib/access";
import { DEV_BYPASS_AUTH } from "@/lib/devBypass";

function selectedCompany(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${COMPANY_COOKIE}=`));
  return hit ? decodeURIComponent(hit.split("=")[1]) : undefined;
}

export function createClient() {
  const companyId = selectedCompany();
  if (DEV_BYPASS_AUTH) {
    // Same anonymous dev session as the server; never picks up a stored sign-in.
    return createPlainClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: companyId ? { headers: { "x-company-id": companyId } } : undefined,
    });
  }
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: companyId ? { headers: { "x-company-id": companyId } } : undefined }
  );
}
