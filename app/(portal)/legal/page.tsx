import { pageGate } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";
import PageHeader from "../PageHeader";
import Locked from "../Locked";
import NoCompany from "../NoCompany";
import LegalView, { type Req } from "./LegalView";
import type { LegalType, LegalWho } from "@/lib/legal/model";

// Legal (spec 09): the company asks Prime Bottomline for a document, pays upfront and gets it back here.
export default async function LegalPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const { session, locked } = await pageGate("legal");
  if (locked) return <Locked page="legal" who={session.who!} />;
  const company = session.company;
  if (!company) return <NoCompany page="legal" admin={session.who === "admin"} />;
  const { r } = await searchParams;
  const supabase = await createClient();
  const [types, reqs, files, extras, notes, pays] = await Promise.all([
    supabase.from("legal_type").select("*").eq("active", true).order("sort"),
    supabase.from("legal_request").select("*").eq("company_id", company.id).order("created_at", { ascending: false }),
    supabase.from("legal_file").select("*"), supabase.from("legal_extra").select("*").order("at"), supabase.from("legal_note").select("*").order("at"), supabase.from("legal_payment").select("*").order("paid_at"),
  ]);
  const err = types.error ?? reqs.error ?? files.error ?? extras.error ?? notes.error ?? pays.error;
  if (err) {
    return (<><PageHeader title={company.name} accent="Legal" /><div className="mx-auto max-w-[1280px] px-5 py-8 md:px-8"><div className="p-4 text-[13px]" style={{ background: "#fbe9e7", border: "1px solid #e3b8b2", color: "#8c1a1a" }}>Legal could not load: {err.message}. If this mentions a missing table, the Legal SQL has not been run yet.</div></div></>);
  }
  const requests: Req[] = (reqs.data ?? []).map((x) => ({
    ...x, files: (files.data ?? []).filter((f) => f.request_id === x.id), extras: (extras.data ?? []).filter((e) => e.request_id === x.id),
    notes: (notes.data ?? []).filter((n) => n.request_id === x.id), payments: (pays.data ?? []).filter((p) => p.request_id === x.id),
  })) as Req[];
  return (
    <>
      <PageHeader title={company.name} accent="Legal" />
      <LegalView companyId={company.id} meName={session.user!.name ?? "You"} who={session.who as LegalWho} types={(types.data ?? []) as LegalType[]} requests={requests} openId={r} testGateway={!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)} />
    </>
  );
}
