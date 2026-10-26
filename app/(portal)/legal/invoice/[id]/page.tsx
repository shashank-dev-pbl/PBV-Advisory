import { pageGate } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/dates";
import { GST_RATE, gstOf, rup } from "@/lib/legal/model";
import Locked from "../../../Locked";

// The final tax invoice, issued on delivery, covering the advance and any approved extra. Print or save as PDF from the browser.
// Open question from the spec: if the work is done by an advocate or law firm rather than Prime Bottomline, GST may be under reverse charge
// (the company pays it, not us). Until Vimal confirms with SPARC, the treatment is printed on the invoice so it is never silently assumed.
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { session, locked } = await pageGate("legal");
  if (locked) return <Locked page="legal" who={session.who!} />;
  const { id } = await params;
  const supabase = await createClient();
  const { data: r } = await supabase.from("legal_request").select("*, type:type_id(name)").eq("id", id).maybeSingle();
  if (!r || r.status !== "done") return <div style={{ padding: 40 }}>This invoice is issued when the request is delivered.</div>;
  const { data: pays } = await supabase.from("legal_payment").select("*").eq("request_id", id).order("paid_at");
  const { data: extras } = await supabase.from("legal_extra").select("what, amount").eq("request_id", id).eq("status", "approved");
  const base = (pays ?? []).reduce((a, p) => a + Number(p.amount), 0), gst = gstOf(base);
  return (
    <div style={{ maxWidth: 760, margin: "40px auto", padding: "0 24px", fontFamily: "system-ui, sans-serif", color: "#1a1a1a" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}><div><b style={{ fontSize: 18 }}>Prime Bottomline Advisory</b><div style={{ color: "#57544a", fontSize: 13 }}>Tax invoice</div></div><div style={{ textAlign: "right", fontSize: 13 }}><b>{r.final_invoice_no}</b><div>Issued {fmtDate(r.delivered_at)}</div></div></div>
      <hr style={{ margin: "18px 0" }} />
      <div style={{ fontSize: 13 }}>For: <b>{session.company?.name}</b><br />Request {r.id} · {(r.type as { name: string }).name} · {r.title}</div>
      <table style={{ width: "100%", marginTop: 18, borderCollapse: "collapse", fontSize: 13.5 }}>
        <tbody>
          {(pays ?? []).filter((p) => p.what === "advance").map((p) => <tr key={p.id}><td style={{ padding: "6px 0" }}>{(r.type as { name: string }).name} — as quoted<div style={{ color: "#8b8779", fontSize: 12 }}>Receipt {p.receipt_no}, paid {fmtDate(p.paid_at)}</div></td><td style={{ textAlign: "right" }}>{rup(Number(p.amount))}</td></tr>)}
          {(extras ?? []).map((x, i) => <tr key={i}><td style={{ padding: "6px 0" }}>Extra work — {x.what}</td><td style={{ textAlign: "right" }}>{rup(Number(x.amount))}</td></tr>)}
          <tr style={{ borderTop: "1px solid #d8cfbc" }}><td style={{ padding: "8px 0" }}>Total before GST</td><td style={{ textAlign: "right" }}>{rup(base)}</td></tr>
          <tr><td>GST at {GST_RATE * 100}%</td><td style={{ textAlign: "right" }}>{rup(gst)}</td></tr>
          <tr style={{ fontWeight: 700, borderTop: "1px solid #1a1a1a" }}><td style={{ padding: "8px 0" }}>Total paid</td><td style={{ textAlign: "right" }}>{rup(base + gst)}</td></tr>
        </tbody>
      </table>
      <p style={{ color: "#57544a", fontSize: 12, marginTop: 22 }}>GST is charged by Prime Bottomline Advisory (forward charge). {(pays ?? []).some((p) => p.gateway === "test") ? "This invoice includes payments made on the test gateway: no money moved." : ""}</p>
      <p style={{ marginTop: 22 }}><a href="javascript:window.print()" style={{ fontSize: 13 }}>Print or save as PDF</a></p>
    </div>
  );
}
