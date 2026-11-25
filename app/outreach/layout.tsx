import "./outreach.css";
import { pageGate } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";
import Locked from "../(portal)/Locked";
import Nav from "./Nav";

// The Outreach tool: its own screens and its own navigation, reached only by address (it is not in the portal menu).
export default async function OutreachLayout({ children }: { children: React.ReactNode }) {
  const { session, locked } = await pageGate("outreach");
  if (locked) return <Locked page="outreach" who={session.who!} />;

  const supabase = await createClient();
  const [replies, approve] = await Promise.all([
    supabase.from("outreach_queue").select("id", { count: "exact", head: true }).eq("stage", "replied"),
    supabase.from("outreach_queue").select("id", { count: "exact", head: true }).eq("stage", "ready").eq("approved", false),
  ]);

  return (
    <div className="ob">
      <div className="app">
        <aside>
          <div className="brand"><b>Prime Bottomline Advisory</b><span>Funding-signal outreach · Swetha&apos;s LinkedIn</span></div>
          <Nav replies={replies.count ?? 0} toApprove={approve.count ?? 0} />
          <div className="side-foot">Companies come from the funding tracker, are confirmed by the news, and only go out once approved.</div>
        </aside>
        <main>{children}</main>
      </div>
    </div>
  );
}
