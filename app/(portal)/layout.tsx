import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { DEV_BYPASS_AUTH } from "@/lib/devBypass";
import PortalShell from "./PortalShell";
import DevStrip from "./DevStrip";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session.user || !session.who) redirect("/login");

  // The badge on "Monthly close": months waiting for PBA to check.
  let closeWaiting = 0;
  if ((session.who === "pba" || session.who === "admin") && session.company) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("period_figures")
      .select("*", { count: "exact", head: true })
      .eq("company_id", session.company.id)
      .eq("state", "submitted");
    closeWaiting = count ?? 0;
  }

  return (
    <>
      {DEV_BYPASS_AUTH && <DevStrip who={session.who} />}
      <PortalShell
        who={session.who}
        companies={session.companies.map((c) => ({ id: c.id, name: c.name, status: c.status }))}
        companyId={session.company?.id ?? null}
        closeWaiting={closeWaiting}
      >
        {children}
      </PortalShell>
    </>
  );
}
