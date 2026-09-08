import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isCurrentUserPlatformAdmin } from "@/lib/admin";
import { listCompaniesWithStats } from "./actions";
import AdminView from "./AdminView";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await isCurrentUserPlatformAdmin())) redirect("/");

  const companies = await listCompaniesWithStats();

  return <AdminView companies={companies} />;
}
