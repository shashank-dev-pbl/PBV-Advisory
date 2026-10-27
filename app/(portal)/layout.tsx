import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { lateMonthCount } from "@/lib/close/late";
import { getSession } from "@/lib/auth";
import { DEV_BYPASS_AUTH } from "@/lib/devBypass";
import PortalShell from "./PortalShell";
import DevStrip from "./DevStrip";
import DemoBar from "./dev/DemoBar";
import { devToolsOn } from "@/lib/dev/tools";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session.user || !session.who) redirect(session.reason ? `/login?e=${encodeURIComponent(session.reason)}` : "/login");

  // The badge on "Monthly close": how many tracked months are late.
  const lateMonths = session.company ? await lateMonthCount(session.company.id) : 0;

  // The badge on Legal: what is waiting for the founder (pay or approve extra), or for Prime Bottomline to price.
  let legalBadge: { n: number; label: string } | null = null;
  if (session.company && session.who !== "external") {
    const supabase = await createClient();
    const { data } = await supabase.from("legal_request").select("status").eq("company_id", session.company.id).in("status", ["quote", "pay", "extra"]);
    const rows = data ?? [];
    const n = session.who === "founder" ? rows.filter((r) => r.status === "pay" || r.status === "extra").length : rows.filter((r) => r.status === "quote").length;
    if (n > 0) legalBadge = { n, label: session.who === "founder" ? "for you" : "to price" };
  }

  // Steps of the company master done, shown as a badge until it is finished.
  let masterDone: number | null = null;
  if (session.company) {
    const supabase = await createClient();
    const { data } = await supabase.from("company_master").select("steps_done, completed").eq("company_id", session.company.id).maybeSingle();
    masterDone = data?.completed ? null : ((data?.steps_done as number[] | undefined)?.length ?? 0);
  }

  return (
    <>
      {DEV_BYPASS_AUTH && <DevStrip note={session.devNote} />}
      {session.company && (session.who === "pba" || session.who === "admin") && devToolsOn(session.company.name) && <DemoBar />}
      <PortalShell
        who={session.who}
        companies={session.companies.map((c) => ({ id: c.id, name: c.name, status: c.status }))}
        companyId={session.company?.id ?? null}
        lateMonths={lateMonths}
        legalBadge={legalBadge}
        masterDone={masterDone}
      >
        {children}
      </PortalShell>
    </>
  );
}
