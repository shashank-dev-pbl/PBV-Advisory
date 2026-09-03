import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const rawCookies = request.cookies.getAll().map((c) => ({ name: c.name, len: c.value.length }));
  const nextHeadersCookies = (await cookies()).getAll().map((c) => ({ name: c.name, len: c.value.length }));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  return NextResponse.json({
    requestCookies: rawCookies,
    nextHeadersCookies,
    user: data.user ? { email: data.user.email } : null,
    error: error?.message ?? null,
  });
}
