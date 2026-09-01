import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { listCompaniesWithStats } from "./actions";
import AdminView from "./AdminView";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");
  if (!isAdminEmail(user.email)) redirect("/");

  const companies = await listCompaniesWithStats();

  return <AdminView companies={companies} />;
}
