import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Clicking the emailed link (this route) lands on founder; the tab that requested the
  // link redirects itself to practitioner once it detects the session (see login/page.tsx).
  const next = searchParams.get("next") ?? "/founder";

  if (code) {
    // Cookies must be set directly on the exact response object we return — mutating
    // next/headers' cookies() in a route handler and then returning a separately
    // constructed NextResponse.redirect() is unreliable about merging the two, which
    // was causing this to intermittently redirect to /founder without the session
    // actually attached (visible as a bounce straight back to /login).
    const response = NextResponse.redirect(`${origin}${next}`);
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return response;
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
