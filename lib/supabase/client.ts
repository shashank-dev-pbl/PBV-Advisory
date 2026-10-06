import { createBrowserClient } from "@supabase/ssr";
import { COMPANY_COOKIE } from "@/lib/access";

function selectedCompany(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${COMPANY_COOKIE}=`));
  return hit ? decodeURIComponent(hit.split("=")[1]) : undefined;
}

export function createClient() {
  const companyId = selectedCompany();
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: companyId ? { headers: { "x-company-id": companyId } } : undefined }
  );
}
