import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let refreshedCookies: { name: string; value: string; options: CookieOptions }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          refreshedCookies = cookiesToSet;
        },
      },
    }
  );

  // Verified once here (a network round-trip to Supabase Auth); forwarded via a request
  // header so getCurrentAppUser() doesn't have to call getUser() a second time per page load.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-verified-user-email", user?.email ?? "");

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  refreshedCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));

  return response;
}
