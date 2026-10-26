import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { lateMonthCount } from "@/lib/close/late";
import { getSession } from "@/lib/auth";
import { DEV_BYPASS_AUTH } from "@/lib/devBypass";
import PortalShell from "./PortalShell";
import DevStrip from "./DevStrip";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session.user || !session.who) redirect(session.reason ? `/login?e=${encodeURIComponent(session.reason)}` : "/login");

  // The badge on "Monthly close": how many tracked months are late.
  const lateMonths = session.company ? await lateMonthCount(session.company.id) : 0;

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
      <PortalShell
        who={session.who}
        companies={session.companies.map((c) => ({ id: c.id, name: c.name, status: c.status }))}
        companyId={session.company?.id ?? null}
        lateMonths={lateMonths}
        masterDone={masterDone}
      >
        {children}
      </PortalShell>
    </>
  );
}
