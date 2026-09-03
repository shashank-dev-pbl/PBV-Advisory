import { cookies } from "next/headers";
import { getCurrentAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function DebugPage() {
  const rawCookies = (await cookies()).getAll().map((c) => ({ name: c.name, len: c.value.length }));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const appUser = await getCurrentAppUser();

  let existingLookup = null;
  let existingLookupError = null;
  let companyLookup = null;
  let companyLookupError = null;
  let insertResult = null;
  let insertError = null;
  if (data.user?.email) {
    const email = data.user.email.toLowerCase();
    const r1 = await supabase.from("app_user").select("*").eq("email", email).maybeSingle();
    existingLookup = r1.data;
    existingLookupError = r1.error?.message ?? null;

    const r2 = await supabase.from("company").select("id").limit(1).single();
    companyLookup = r2.data;
    companyLookupError = r2.error?.message ?? null;

    if (r2.data) {
      const r3 = await supabase
        .from("app_user")
        .insert({ email: email + ".debugtest", name: email.split("@")[0], role: "founder", company_id: r2.data.id })
        .select("*")
        .single();
      insertResult = r3.data;
      insertError = r3.error?.message ?? null;
    }
  }

  const whoami = await supabase.rpc("debug_whoami");

  return (
    <pre>{JSON.stringify({
      rawCookies,
      directUser: data.user?.email ?? null,
      directError: error?.message ?? null,
      appUser,
      existingLookup,
      existingLookupError,
      companyLookup,
      companyLookupError,
      insertResult,
      insertError,
      whoami: whoami.data,
      whoamiError: whoami.error?.message ?? null,
    }, null, 2)}</pre>
  );
}
