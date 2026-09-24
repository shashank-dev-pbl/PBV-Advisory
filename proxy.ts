import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { DEV_BYPASS_AUTH } from "@/lib/devBypass";

export async function proxy(request: NextRequest) {
  if (DEV_BYPASS_AUTH) {
    // While phone OTP isn't wired up, three genuinely distinct test accounts
    // (one per role) still exist so invariants needing separate identities
    // (a PBA account verifying a month can't be the one that submitted it)
    // still hold. Which one applies per request is picked from the desk
    // being visited — see lib/auth.ts's DEV_BYPASS_USERS.
    const segment = request.nextUrl.pathname.split("/")[1];
    const role = segment === "founder" || segment === "practitioner" || segment === "pba" ? segment : "practitioner";
    request.headers.set("x-dev-bypass-role", role);
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
