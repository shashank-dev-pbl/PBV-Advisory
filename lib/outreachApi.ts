import { createClient } from "@supabase/supabase-js";

// What the LinkedIn extension talks to. It has no sign-in, so every call carries the shared key in x-extension-key and the
// database functions (outreach_*) check it against the hash stored by outreach_set_key(). This client is the plain anon one:
// it can do nothing in the database except call those functions.
export const extensionDb = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

export const keyOf = (req: Request) => req.headers.get("x-extension-key") ?? "";

export function fail(error: { message: string; code?: string }) {
  const unauthorized = error.code === "28000" || /unauthorized/i.test(error.message);
  return Response.json({ error: unauthorized ? "Unauthorized" : error.message }, { status: unauthorized ? 401 : 500 });
}
