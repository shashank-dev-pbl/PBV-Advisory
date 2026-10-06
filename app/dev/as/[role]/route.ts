import { NextResponse } from "next/server";
import { DEV_BYPASS_AUTH } from "@/lib/devBypass";
import { COMPANY_COOKIE, DEV_AS_COOKIE, LANDING, PAGES, type Who } from "@/lib/access";

// Demo switcher for while real sign-in is off: "view the portal as" one of the four test accounts.
// Does nothing once DEV_BYPASS_AUTH is false.
export async function GET(request: Request, { params }: { params: Promise<{ role: string }> }) {
  if (!DEV_BYPASS_AUTH) return new NextResponse("Not found", { status: 404 });
  const { role } = await params;
  if (!(role in LANDING)) return new NextResponse("Not found", { status: 404 });
  const response = NextResponse.redirect(new URL(PAGES[LANDING[role as Who]].href, request.url));
  response.cookies.set(DEV_AS_COOKIE, role, { path: "/", sameSite: "lax" });
  response.cookies.delete(COMPANY_COOKIE);
  return response;
}
