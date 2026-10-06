import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { COMPANY_COOKIE } from "@/lib/access";

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
          return cookieStore.getAll();
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
