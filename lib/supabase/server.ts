import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { COMPANY_COOKIE } from "@/lib/access";
import { DEV_BYPASS_AUTH } from "@/lib/devBypass";

export async function createClient() {
  const cookieStore = await cookies();
  // Tells the database which of the person's companies they are acting in. current_app_user() only
  // honours it if an active company_access row exists, so it cannot be used to reach a company.
  const companyId = cookieStore.get(COMPANY_COOKIE)?.value;

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: companyId ? { headers: { "x-company-id": companyId } } : undefined,
      cookies: {
        getAll() {
          // Real sign-in is off: ignore any leftover sign-in cookie in the browser so every request is the
          // same anonymous dev session, whoever happened to sign in on this machine before.
          const all = cookieStore.getAll();
          return DEV_BYPASS_AUTH ? all.filter((c) => !c.name.startsWith("sb-")) : all;
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // called from a Server Component with no request context — middleware refreshes the session
          }
        },
      },
    }
  );
}
