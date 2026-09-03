import { cookies } from "next/headers";
import { getCurrentAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function DebugPage() {
  const rawCookies = (await cookies()).getAll().map((c) => ({ name: c.name, len: c.value.length }));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const appUser = await getCurrentAppUser();
  return (
    <pre>{JSON.stringify({ rawCookies, directUser: data.user?.email ?? null, directError: error?.message ?? null, appUser }, null, 2)}</pre>
  );
}
