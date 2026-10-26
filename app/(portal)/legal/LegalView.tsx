"use client";

import "../proto.css";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeStorageSegment } from "@/lib/storagePath";
import { unwrap } from "@/lib/actionResult";
import { fmtDate } from "@/lib/dates";
import { STATUS, STEPS, can, canEditPrices, canPay, fixedPrice, gstOf, isStaff, rup, stepOf, suggestQuote, waitingOnMe, withGst, type LegalStatus, type LegalType, type LegalWho } from "@/lib/legal/model";
import { addNote, confirmTestPayment, createRequest, deliverRequest, legalFileUrl, proposeExtra, recordFinished, sendQuote, setPrice, startPayment } from "./actions";

type Payment = { id: string; what: "advance" | "extra"; amount: number; gst: number; receipt_no: string; paid_at: string; gateway: string };
type Extra = { id: string; what: string; amount: number; reason: string; status: "proposed" | "approved" | "withdrawn"; at: string; by_name: string | null };
type Note = { id: string; by_name: string | null; by_role: string | null; at: string; text: string };
type FileRow = { id: string; storage_path: string; filename: string; pages: number | null; by_name: string | null; at: string };
export type Req = {
  id: string; type_id: string; title: string; party: string | null; need: string | null; needed_by: string | null; created_by_name: string | null; created_at: string; status: LegalStatus; pages: number | null;
  price: number | null; quote_amount: number | null; quote_note: string | null; quoted_at: string | null; ready_filename: string | null; ready_path: string | null; ready_at: string | null; delivered_at: string | null;
  findings: { level: "High" | "Medium" | "Low"; text: string }[] | null; final_invoice_no: string | null; files: FileRow[]; extras: Extra[]; notes: Note[]; payments: Payment[];
};
function Tile({ label, val, sub, flag }: { label: string; val: React.ReactNode; sub: string; flag?: boolean }) { return <div className={`tile ${flag ? "red" : ""}`}><div className="tlab">{label}</div><div className="tv">{val}</div><div className="ts">{sub}</div></div>; }
const Pill = ({ s }: { s: LegalStatus }) => <span className="lpill" style={{ color: STATUS[s].colour, background: STATUS[s].bg }}>{STATUS[s].label}</span>;
const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));
const paid = (r: Req) => r.payments.reduce((a, p) => a + Number(p.amount), 0);
const pend = (r: Req) => r.extras.filter((x) => x.status === "proposed").reduce((a, x) => a + Number(x.amount), 0);
// A PDF's page count, read from the file itself; anything else is entered by hand.
async function pdfPages(f: File): Promise<number | null> {
  if (!/\.pdf$/i.test(f.name)) return null;
  const txt = new TextDecoder("latin1").decode(new Uint8Array(await f.arrayBuffer()));
  const n = (txt.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  return n || null;
}

export default function LegalView({ companyId, meName, who, types, requests, openId, testGateway }: { companyId: string; meName: string; who: LegalWho; types: LegalType[]; requests: Req[]; openId?: string; testGateway: boolean }) {
  const router = useRouter();
  const staff = isStaff(who);
  const [tab, setTab] = useState<"draft" | "review" | "price">("draft");
  const [sel, setSel] = useState<string | null>(openId ?? null);
  const [form, setForm] = useState<null | { type: string | null; kind: "draft" | "review"; file: File | null; pages: string }>(null);
  const [busy, startT] = useTransition();
  const [working, setWorking] = useState("");
  const [err, setErr] = useState("");
  const [checkout, setCheckout] = useState<null | { title: string; base: number; run: () => Promise<void> }>(null);
  const [lxOpen, setLxOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const fileIn = useRef<HTMLInputElement>(null);
  const finIn = useRef<HTMLInputElement>(null);
  const [fld, setFld] = useState({ title: "", party: "", needed: "", need: "", quote: "", quoteNote: "", xWhat: "", xAmt: "", xWhy: "" });
  const [finds, setFinds] = useState<{ level: "High" | "Medium" | "Low"; text: string }[]>([{ level: "High", text: "" }]);
  const [about, setAbout] = useState(false);
  const type = (id: string) => types.find((t) => t.id === id)!;
  const act = (what: string, fn: () => Promise<unknown>, then?: () => void) => startT(async () => { setErr(""); setWorking(what); try { const res = await fn(); if (res && typeof res === "object" && "ok" in res) unwrap(res as never); then?.(); router.refresh(); } catch (e) { setErr(e instanceof Error ? e.message : "Could not do that"); } setWorking(""); });

  const mine = requests.filter((r) => type(r.type_id)?.kind === tab);
  const waiting = requests.filter((r) => r.status === "pay" || r.status === "extra");
  const withPba = requests.filter((r) => r.status === "quote" || r.status === "progress");
  const fy = requests.reduce((a, r) => a + paid(r), 0);
  const open = sel ? requests.find((r) => r.id === sel) ?? null : null;


  function card(r: Req) {
    const t = type(r.type_id), me = waitingOnMe(who, r.status) || (canPay(who) && ["pay", "extra"].includes(r.status));
    const amt = r.status === "quote" ? (t.price ? `From ${rup(t.price)}` : t.quote_from ? `From ${rup(t.quote_from)}` : "To be priced") : r.status === "pay" ? `${rup(r.quote_amount ?? 0)} + GST` : `${rup(paid(r))} paid`;
    return (
      <div key={r.id} className={`lcard ${me ? "me" : ""}`} onClick={() => { setSel(r.id); setForm(null); setErr(""); }}>
        <div className="lct"><div><div className="dm">{r.id} · {t.name}</div><b>{r.title}</b></div><Pill s={r.status} /></div>
        <div className="lcm"><span>{amt}</span><span>{r.status === "done" && r.delivered_at ? `Delivered ${fmtDate(r.delivered_at)}` : r.needed_by ? `Needed by ${fmtDate(r.needed_by)}` : ""}</span>
          {r.status === "extra" && <span className="late">{rup(withGst(pend(r)))} to approve</span>}{me && <span className="late">Waiting on you</span>}</div>
      </div>
    );
  }
  function typeCard(t: LegalType) {
    return (
      <div className="ltype" key={t.id}><div className="lth"><b>{t.name}</b><span className="lprice">{t.price != null ? rup(t.price) : t.quote_from ? `From ${rup(t.quote_from)}` : "Priced on request"}</span></div>
        <div className="ltw">{t.what_it_is}</div><div className="ltwhen"><b>When you need it:</b> {t.when_needed}</div>
        <div className="ltf"><span className="dm">{t.days ? `Ready in ${t.days} working day${t.days > 1 ? "s" : ""}` : "Timing agreed with the price"}{t.pages_covered ? ` · standard price covers up to ${t.pages_covered} pages` : ""}{t.unit_note ? ` · ${t.unit_note}` : ""}</span>
          <button className="b quiet xs" onClick={() => { setForm({ type: t.id, kind: t.kind, file: null, pages: "" }); setSel(null); setFld({ ...fld, title: "", party: "", needed: "", need: "" }); setErr(""); }}>Request</button></div></div>
    );
  }

  /* ---- payment ---- */
  function askToPay(title: string, base: number, run: () => Promise<void>) { setCheckout({ title, base, run }); }
  async function pay(id: string, purpose: "advance" | "extra") {
    const order = unwrap(await startPayment(id, purpose));
    if (order.gateway === "test") { unwrap(await confirmTestPayment(order.orderId)); return; }
    // Razorpay: its signed callback marks the order paid; here we just wait for it.
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script"); s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = () => { const R = (window as unknown as { Razorpay: new (o: Record<string, unknown>) => { open: () => void } }).Razorpay; new R({ key: order.keyId, order_id: order.gatewayOrderId, name: "Prime Bottomline Advisory", handler: () => setTimeout(resolve, 2500), modal: { ondismiss: () => reject(new Error("Payment cancelled")) } }).open(); };
      s.onerror = () => reject(new Error("Could not open the payment page")); document.body.appendChild(s);
    });
  }

  /* ---- request panel ---- */
  function panel(r: Req) {
    const t = type(r.type_id), status = r.status, step = stepOf(status), p = pend(r);
    const lines: [string, number, string, boolean?][] = [...r.payments.map((x): [string, number, string] => [`${x.what === "advance" ? "Advance" : "Extra work"} paid ${fmtDate(x.paid_at)}`, Number(x.amount), `Receipt ${x.receipt_no}${x.gateway === "test" ? " · test payment" : ""}`]),
      ...r.extras.filter((x) => x.status === "proposed").map((x): [string, number, string, boolean] => [`${x.what} — waiting for approval`, Number(x.amount), "Not charged yet", true])];
    return (
      <div className="dback" onClick={(e) => { if (e.target === e.currentTarget) setSel(null); }}>
        <aside className="drawer">
          <div className="dh"><div><div className="dm">{r.id} · {t.kind === "draft" ? "We draft for you" : "We review yours"} · {t.name}</div><div className="dt2">{r.title}</div></div><button className="x" style={{ fontSize: 22 }} onClick={() => setSel(null)}>×</button></div>
          <div className="lprog">{STEPS.map((s, i) => <div key={s} className={`${i < step ? "on" : ""} ${i === step - 1 && status !== "done" ? "cur" : ""}`}><i /><span>{s}</span></div>)}</div>
          {err && <div className="sys warn" style={{ marginLeft: 0 }}>{err}</div>}

          {status === "quote" && (can(who, status, "price") ? (
            <div className="lact"><b>Send a price</b><div className="dm">Standard price {t.price ? `${rup(t.price)}${t.pages_covered ? ` for up to ${t.pages_covered} pages` : ""}` : "not set"}{r.pages ? ` · this file is ${r.pages} pages` : ""}.</div>
              <div className="mform" style={{ marginTop: 8 }}><label>Price before GST<input placeholder="₹" value={fld.quote} onChange={(e) => setFld({ ...fld, quote: e.target.value.replace(/\D/g, "") })} /></label><label>Note to the founder<input placeholder="What the price covers" value={fld.quoteNote} onChange={(e) => setFld({ ...fld, quoteNote: e.target.value })} /></label></div>
              <button className="b solid xs" disabled={busy} onClick={() => act("price", () => sendQuote(r.id, +(fld.quote || suggestQuote(t, r.pages) || 0), fld.quoteNote))}>{busy && working === "price" ? "Sending…" : "Send price"}</button>
              {!fld.quote && suggestQuote(t, r.pages) ? <div className="dm" style={{ marginTop: 6 }}>Suggested: {rup(suggestQuote(t, r.pages)!)} — type it above to use it, or change it.</div> : null}</div>
          ) : <div className="lact wait"><b>Prime Bottomline is pricing this.</b><div className="dm">You&apos;ll get a price within one working day. Nothing is charged until you pay it.</div></div>)}

          {status === "pay" && (canPay(who) ? (
            <div className="lact me"><b>Price: {rup(r.quote_amount ?? 0)} + GST = {rup(withGst(r.quote_amount ?? 0))}</b>{r.quote_note && <div className="dm">{r.quote_note}</div>}
              <div className="next"><button className="b solid" onClick={() => askToPay(r.title, r.quote_amount ?? 0, () => pay(r.id, "advance"))}>Pay {rup(withGst(r.quote_amount ?? 0))} and start</button></div><div className="dm">Work starts as soon as it&apos;s paid.</div></div>
          ) : <div className="lact wait"><b>Price sent: {rup(r.quote_amount ?? 0)} + GST.</b><div className="dm">Waiting for the founder to pay. Work starts after payment.</div></div>)}

          {status === "progress" && (can(who, status, "finish") ? (
            <div className="lact"><b>Finish the work</b>
              {r.ready_filename ? <><div className="dm">Finished document uploaded: {r.ready_filename}</div>
                {t.kind === "review" && <div style={{ marginTop: 8 }}><div className="exh">What we found</div>{finds.map((f, i) => <div key={i} className="mform" style={{ gridTemplateColumns: "110px 1fr", marginBottom: 4 }}><select value={f.level} onChange={(e) => setFinds(finds.map((x, j) => (j === i ? { ...x, level: e.target.value as typeof f.level } : x)))}><option>High</option><option>Medium</option><option>Low</option></select><input placeholder="One finding, plainly" value={f.text} onChange={(e) => setFinds(finds.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} /></div>)}<button className="b quiet xs" onClick={() => setFinds([...finds, { level: "Medium", text: "" }])}>+ Add a finding</button></div>}
                <div className="next"><button className="b solid xs" disabled={busy} onClick={() => act("deliver", () => deliverRequest(r.id, finds), () => setSel(r.id))}>{busy && working === "deliver" ? "Delivering…" : "Deliver"}</button><button className="b quiet xs" onClick={() => setLxOpen(true)}>Add extra work first</button></div></>
                : <div className="next"><button className="b solid xs" disabled={busy} onClick={() => finIn.current?.click()}>{busy && working === "finish" ? "Uploading…" : "Upload the finished document"}</button></div>}
              {lxOpen && r.ready_filename && <><div className="mform" style={{ marginTop: 10 }}><label>What<input placeholder="e.g. Second round of changes" value={fld.xWhat} onChange={(e) => setFld({ ...fld, xWhat: e.target.value })} /></label><label>Amount before GST<input placeholder="₹" value={fld.xAmt} onChange={(e) => setFld({ ...fld, xAmt: e.target.value.replace(/\D/g, "") })} /></label><label style={{ gridColumn: "1/-1" }}>Why — the founder sees this<input placeholder="What was beyond the original request" value={fld.xWhy} onChange={(e) => setFld({ ...fld, xWhy: e.target.value })} /></label></div>
                <div className="next"><button className="b solid xs" disabled={busy} onClick={() => act("extra", () => proposeExtra(r.id, fld.xWhat, +fld.xAmt, fld.xWhy), () => { setLxOpen(false); setFld({ ...fld, xWhat: "", xAmt: "", xWhy: "" }); })}>Send to founder for approval</button><button className="b quiet xs" onClick={() => setLxOpen(false)}>Cancel</button></div><div className="dm">The document stays locked until the founder approves and pays.</div></>}</div>
          ) : <div className="lact wait"><b>Prime Bottomline is working on it.</b><div className="dm">{t.days ? `Usually ready in ${t.days} working day${t.days > 1 ? "s" : ""}.` : ""} Questions come to you in the notes below.</div></div>)}

          {status === "extra" && (canPay(who) ? (
            <div className="lact me"><b>Your document is ready — there&apos;s extra work to approve first.</b>
              {r.extras.filter((x) => x.status === "proposed").map((x) => <div className="xline" key={x.id}><div><b>{x.what}</b><div className="dm">{x.reason}</div></div><span>{rup(Number(x.amount))}</span></div>)}
              <div className="xline tot"><span>Extra, with GST</span><b>{rup(withGst(p))}</b></div>
              <div className="next"><button className="b solid" onClick={() => askToPay(`Extra work — ${r.title}`, p, () => pay(r.id, "extra"))}>Approve and pay {rup(withGst(p))}</button><button className="b quiet" onClick={() => document.getElementById("lnote_in")?.focus()}>Ask a question</button></div>
              <div className="dm">You receive the document as soon as it&apos;s paid. The final invoice includes the extra.</div></div>
          ) : <div className="lact wait"><b>Waiting for the founder to approve {rup(p)} of extra work.</b><div className="dm">The finished document is released once they pay.</div></div>)}

          {status === "done" && (
            <div className="lact done"><b>Delivered {r.delivered_at ? fmtDate(r.delivered_at) : ""}</b>
              {r.ready_filename && <div className="dfile"><span className="fic">DOC</span><div><b>{r.ready_filename}</b><div className="dm">Also saved in Files delivered</div></div><button className="b quiet xs" style={{ marginLeft: "auto" }} onClick={() => act("open", async () => { const u = await legalFileUrl(r.id, "ready"); if (u.ok) window.open(u.data, "_blank"); return u; })}>Download</button></div>}
              {r.findings?.length ? <><div className="exh" style={{ marginTop: 10 }}>What we found</div>{r.findings.map((f, i) => <div className="rk" key={i}><span className={`rkl ${f.level.toLowerCase()}`}>{f.level}</span><span>{f.text}</span></div>)}</> : null}</div>
          )}
          {status === "extra" && r.ready_filename && <div className="dfile locked"><span className="fic">DOC</span><div><b>{r.ready_filename}</b><div className="dm">Ready {r.ready_at ? fmtDate(r.ready_at) : ""} · released after the extra is paid</div></div><span className="lockic2">🔒</span></div>}

          <div className="dsec"><h4>The request</h4>
            <div className="mgrid">{([["Other party", r.party || "—"], ["Needed by", r.needed_by ? fmtDate(r.needed_by) : "—"], ["Asked by", `${r.created_by_name ?? "—"} · ${fmtDate(r.created_at)}`], ["Turnaround", t.days ? `${t.days} working days` : "Agreed with price"]] as [string, string][]).map(([a, b]) => <div key={a}><span>{a}</span><b style={{ fontSize: 13.5 }}>{b}</b></div>)}</div>
            {r.need && <div className="lneed">{r.need}</div>}
            {r.files.map((f) => <div className="dfile sm" key={f.id}><span className="fic">{/\.pdf$/i.test(f.filename) ? "PDF" : "DOC"}</span><div><b>{f.filename}</b><div className="dm">{f.pages ? `${f.pages} pages · ` : ""}uploaded by {f.by_name} · {fmtDate(f.at)}</div></div><button className="b quiet xs" style={{ marginLeft: "auto" }} onClick={() => act("open", async () => { const u = await legalFileUrl(r.id, "attached", f.storage_path); if (u.ok) window.open(u.data, "_blank"); return u; })}>Open</button></div>)}</div>
          <div className="xp"><button className="xph" onClick={() => setAbout(!about)}><span className="chev">{about ? "⌄" : "›"}</span>About this document</button>{about && <div className="xpb"><div className="explain"><div className="exh">What it is</div><div>{t.what_it_is}</div><div className="exh" style={{ marginTop: 8 }}>When you need it</div><div>{t.when_needed}</div><div className="exh" style={{ marginTop: 8 }}>What you get</div><div>{t.what_you_get}</div></div></div>}</div>
          {lines.length > 0 && <div className="dsec"><div className="dsh"><h4>Money</h4><span className="dm">all amounts before GST</span></div><div className="mtab">
            {lines.map(([a, b, c, pending], i) => <div key={i} className={pending ? "pend" : ""}><div><b>{a}</b><div className="dm">{c}</div></div><span>{rup(b)}</span></div>)}
            <div className="tot"><div><b>{status === "done" ? `Final invoice ${r.final_invoice_no}` : "Paid so far"}</b><div className="dm">{status === "done" ? "Tax invoice for the full work, issued on delivery" : "Final invoice is issued on delivery and includes any approved extra"}</div></div><span>{rup(paid(r))} <small>+ GST {rup(gstOf(paid(r)))}</small></span></div></div>
            {status === "done" && <div className="next"><a className="b quiet xs" href={`/legal/invoice/${r.id}`} target="_blank">Download invoice</a></div>}</div>}
          <div className="dsec"><h4>Notes</h4>{r.notes.length ? r.notes.map((n) => <div key={n.id} className={`lnote ${n.by_role === "founder" ? "f" : ""}`}><b>{n.by_name}</b> <span className="dm">{fmtDate(n.at)}</span><div>{n.text}</div></div>) : <div className="dm">No notes yet.</div>}
            {can(who, status, "note") && <div className="lnin"><input id="lnote_in" placeholder={who === "founder" ? "Ask Prime Bottomline something" : "Ask the founder something"} value={noteText} onChange={(e) => setNoteText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && noteText.trim()) act("note", () => addNote(r.id, noteText), () => setNoteText("")); }} /><button className="b quiet xs" disabled={busy || !noteText.trim()} onClick={() => act("note", () => addNote(r.id, noteText), () => setNoteText(""))}>Send</button></div>}</div>
        </aside>
      </div>
    );
  }

  /* ---- new request ---- */
  function newPanel() {
    if (!form) return null;
    const close = () => setForm(null);
    if (!form.type) {
      return (
        <div className="dback" onClick={(e) => { if (e.target === e.currentTarget) close(); }}><aside className="drawer">
          <div className="dh"><div><div className="dm">New legal request</div><div className="dt2">What do you need?</div></div><button className="x" style={{ fontSize: 22 }} onClick={close}>×</button></div>
          <div className="seg" style={{ marginBottom: 12 }}><button className={form.kind === "draft" ? "on" : ""} onClick={() => setForm({ ...form, kind: "draft" })}>Draft something for me</button><button className={form.kind === "review" ? "on" : ""} onClick={() => setForm({ ...form, kind: "review" })}>Review something I received</button></div>
          <div className="lpick">{types.filter((t) => t.kind === form.kind).map((t) => <button key={t.id} onClick={() => setForm({ ...form, type: t.id })}><div><b>{t.name}</b><div className="dm">{t.what_it_is}</div></div><span>{t.price != null ? rup(t.price) : t.quote_from ? `from ${rup(t.quote_from)}` : "quote"}</span></button>)}</div>
        </aside></div>
      );
    }
    const t = type(form.type), pages = form.pages ? +form.pages : null;
    const fixed = fixedPrice(t, t.kind === "review" ? pages : null) ?? (t.price != null && t.pages_covered == null ? t.price : null);
    const within = t.pages_covered && pages ? pages <= t.pages_covered : null;
    const needFile = t.kind === "review" && !form.file;
    const submit = () => {
      if (needFile) { setErr("Attach the document to review"); return; }
      if (!fld.title.trim()) { setErr("Give the request a name"); return; }
      const go = async () => {
        let file: { storagePath: string; filename: string } | undefined;
        if (form.file) {
          const path = `${companyId}/legal-in/${uid()}-${safeStorageSegment(form.file.name)}`;
          const { error } = await createClient().storage.from("docs").upload(path, form.file);
          if (error) throw error;
          file = { storagePath: path, filename: form.file.name };
        }
        const made = unwrap(await createRequest({ typeId: t.id, title: fld.title, party: fld.party, need: fld.need, neededBy: fld.needed || undefined, pages, file }));
        if (made.status === "pay") askToPay(fld.title, fixed ?? 0, async () => { await pay(made.id, "advance"); });
        setForm(null); setSel(made.id);
      };
      startT(async () => { setErr(""); setWorking("submit"); try { await go(); router.refresh(); } catch (e) { setErr(e instanceof Error ? e.message : "Could not submit"); } setWorking(""); });
    };
    return (
      <div className="dback" onClick={(e) => { if (e.target === e.currentTarget) close(); }}><aside className="drawer">
        <div className="dh"><div><div className="dm"><a className="lnk" onClick={() => setForm({ ...form, type: null })}>← All {t.kind === "draft" ? "drafting" : "review"} options</a></div><div className="dt2">{t.name}</div></div><button className="x" style={{ fontSize: 22 }} onClick={close}>×</button></div>
        {err && <div className="sys warn" style={{ marginLeft: 0 }}>{err}</div>}
        <div className="explain"><div className="exh">What it is</div><div>{t.what_it_is}</div><div className="exh" style={{ marginTop: 8 }}>When you need it</div><div>{t.when_needed}</div><div className="exh" style={{ marginTop: 8 }}>What you get</div><div>{t.what_you_get}{t.days ? ` Ready in ${t.days} working day${t.days > 1 ? "s" : ""}.` : ""}</div></div>
        <div className="dsec"><h4>Tell us what you need</h4><div className="mform one">
          <label>A name for this request<input placeholder={t.kind === "draft" ? "e.g. NDA with Acme" : "e.g. Acme master services agreement"} value={fld.title} onChange={(e) => setFld({ ...fld, title: e.target.value })} /></label>
          <label>The other party<input placeholder="Company or person" value={fld.party} onChange={(e) => setFld({ ...fld, party: e.target.value })} /></label>
          <label>Needed by<input type="date" value={fld.needed} onChange={(e) => setFld({ ...fld, needed: e.target.value })} /></label>
          <label>What matters to you<textarea rows={3} placeholder={t.kind === "draft" ? "Key terms, anything unusual" : "What worries you, what you want changed"} value={fld.need} onChange={(e) => setFld({ ...fld, need: e.target.value })} /></label></div>
          <input ref={fileIn} type="file" hidden accept=".pdf,.doc,.docx" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const n = await pdfPages(f); setForm({ ...form, file: f, pages: n ? String(n) : form.pages }); }} />
          <div className={`drop2 ${form.file ? "on" : ""}`} onClick={() => fileIn.current?.click()}>{form.file ? <><span className="fic">{/\.pdf$/i.test(form.file.name) ? "PDF" : "DOC"}</span><div><b>{form.file.name}</b><div className="dm">click to replace</div></div></> : <div><b>{t.kind === "review" ? "Upload the document to review" : "Attach anything useful (optional)"}</b><div className="dm">PDF or Word</div></div>}</div>
          {t.kind === "review" && form.file && <div className="mform" style={{ marginTop: 8 }}><label>Number of pages<input inputMode="numeric" value={form.pages} onChange={(e) => setForm({ ...form, pages: e.target.value.replace(/\D/g, "") })} /></label></div>}</div>
        <div className="dsec"><h4>Price</h4>
          {needFile ? <div className="lprice-box"><b>{t.price != null ? `${rup(t.price)} for up to ${t.pages_covered} pages` : "Priced after we see it"}</b><div className="dm">Upload the document to see your price.</div></div>
            : fixed != null ? <div className="lprice-box"><div className="ck-row"><span>Fee</span><b>{rup(fixed)}</b></div><div className="ck-row dm"><span>GST at 18%</span><span>{rup(gstOf(fixed))}</span></div><div className="ck-row tot"><span>Pay now</span><b>{rup(withGst(fixed))}</b></div>{within && <div className="dm" style={{ marginTop: 6 }}>Your file is {pages} pages — within the standard price.</div>}<div className="dm">If the work turns out bigger than asked, we&apos;ll show you the extra and its reason before delivery. Nothing extra is charged without your approval.</div></div>
            : <div className="lprice-box q"><b>We&apos;ll send you a price within one working day.</b><div className="dm">{within === false ? `Your file is ${pages} pages — longer than the ${t.pages_covered} the standard price covers. ` : ""}{t.quote_from || t.price ? `Usually from ${rup(t.quote_from ?? t.price ?? 0)}. ` : ""}You pay before work starts.</div></div>}</div>
        <div className="next" style={{ marginTop: 14 }}><button className="b solid" disabled={busy} onClick={submit}>{busy && working === "submit" ? "Submitting…" : needFile ? "Submit" : fixed != null ? `Pay ${rup(withGst(fixed))} and submit` : "Submit for a price"}</button><button className="b quiet" onClick={close}>Cancel</button></div>
      </aside></div>
    );
  }

  function checkoutModal() {
    if (!checkout) return null;
    const g = gstOf(checkout.base), tot = checkout.base + g;
    return (
      <div className="mback" onClick={(e) => { if (e.target === e.currentTarget && !busy) setCheckout(null); }}>
        <div className="modal" role="dialog" aria-modal="true"><div className="mt">Pay Prime Bottomline Advisory</div>
          <div className="mb"><div className="ck-box"><div className="ck-row"><span>{checkout.title}</span><b>{rup(checkout.base)}</b></div><div className="ck-row dm"><span>GST at 18%</span><span>{rup(g)}</span></div><div className="ck-row tot"><span>Total</span><b>{rup(tot)}</b></div></div>
            {testGateway ? <div className="sys warn" style={{ marginLeft: 0 }}><b>Test payment.</b> No gateway is connected yet, so no money moves. The receipt says “test payment”.</div> : <div className="ck-m">{["UPI", "Card", "Net banking"].map((m, i) => <label key={m}><input type="radio" name="pm" defaultChecked={i === 0} /> {m}</label>)}</div>}
            <div className="dm">Secure checkout through the payment gateway. A receipt is issued straight away.</div>{err && <div className="ferr">{err}</div>}</div>
          <div className="macts"><button className="b quiet" disabled={busy} onClick={() => setCheckout(null)}>Cancel</button>
            <button className="b solid" disabled={busy} onClick={() => act("pay", checkout.run, () => setCheckout(null))}>{busy && working === "pay" ? <><span className="spin w" />Paying…</> : `Pay ${rup(tot)}`}</button></div></div>
      </div>
    );
  }

  async function onFinished(f: File | undefined) {
    if (finIn.current) finIn.current.value = ""; if (!f || !open) return;
    act("finish", async () => {
      const path = `${companyId}/legal-out/${open.id}/${uid()}-${safeStorageSegment(f.name)}`;
      const { error } = await createClient().storage.from("docs").upload(path, f); if (error) throw error;
      return recordFinished(open.id, path, f.name);
    });
  }

  /* ---- page ---- */
  const active = mine.filter((r) => r.status !== "done"), done = mine.filter((r) => r.status === "done");
  return (
    <div className="p5">
      <input ref={finIn} type="file" hidden onChange={(e) => onFinished(e.target.files?.[0])} />
      <div className="content" style={{ padding: "18px 22px" }}>
        <div className="lstats">
          <Tile label={`Waiting on ${who === "founder" ? "you" : "the founder"}`} val={waiting.length} sub={waiting.length ? waiting.map((r) => r.id).join(", ") : "Nothing to approve or pay"} flag={waiting.length > 0} />
          <Tile label="With Prime Bottomline" val={withPba.length} sub="Being priced or worked on" />
          <Tile label="Delivered" val={requests.filter((r) => r.status === "done").length} sub="Saved to Files delivered" />
          <Tile label="Paid this year" val={rup(fy)} sub={`before GST · ${rup(withGst(fy))} with GST`} />
        </div>
        <div className="dhead"><div className="seg"><button className={tab === "draft" ? "on" : ""} onClick={() => setTab("draft")}>We draft for you</button><button className={tab === "review" ? "on" : ""} onClick={() => setTab("review")}>We review yours</button>{staff && <button className={tab === "price" ? "on" : ""} onClick={() => setTab("price")}>Price list</button>}</div>
          <button className="b solid" style={{ marginLeft: "auto" }} onClick={() => { setForm({ type: null, kind: tab === "review" ? "review" : "draft", file: null, pages: "" }); setSel(null); setErr(""); }}>New request</button></div>
        {tab === "price" ? <PriceList types={types} editable={canEditPrices(who)} onSave={(id, price, days) => act("price", () => setPrice(id, price, days))} /> : (
          <>
            <div className="lintro">{tab === "draft" ? <><b>Documents Prime Bottomline writes for the company.</b> Pick one, tell us what you need, pay the listed price, and it&apos;s delivered in the time shown.</> : <><b>Documents someone else wrote — a client, vendor, landlord or investor.</b> Upload it. If it&apos;s within the standard length you pay the listed price; if not, we send a price within one working day.</>}</div>
            <div className="gh"><h3>Requests</h3><span className="gsrc">{active.length} open · {done.length} delivered</span></div>
            {active.length ? <div className="lgrid">{active.map(card)}</div> : <div className="dm">No open requests.</div>}
            {done.length > 0 && <div className="xp o"><div className="xph" style={{ cursor: "default" }}>Delivered ({done.length})</div><div className="xpb"><div className="lgrid">{done.map(card)}</div></div></div>}
            <div className="gh" style={{ marginTop: 22 }}><h3>{tab === "draft" ? "What we can draft" : "What we can review"}</h3><span className="gsrc">prices before GST</span></div>
            <div className="ltypes">{types.filter((t) => t.kind === tab).map(typeCard)}</div>
          </>
        )}
      </div>
      {open && panel(open)}{newPanel()}{checkoutModal()}
    </div>
  );
}

function PriceList({ types, editable, onSave }: { types: LegalType[]; editable: boolean; onSave: (id: string, price: number | null, days: number | null) => void }) {
  return (
    <>
      <div className="lintro">{editable ? "Change a price or turnaround and it applies to new requests straight away. Requests already paid keep their price." : "Only a PBA admin can change prices."} Prices are before GST.</div>
      {(["draft", "review"] as const).map((k) => (
        <div key={k}><div className="gh"><h3>{k === "draft" ? "Drafting" : "Review"}</h3></div>
          <div className="tw"><table className="dt ptab"><thead><tr><th>Document</th><th>Price (₹)</th><th>Working days</th>{k === "review" && <th>Pages covered</th>}</tr></thead>
            <tbody>{types.filter((t) => t.kind === k).map((t) => (
              <tr key={t.id}><td>{t.name}</td>
                <td>{editable ? <input className="pin" defaultValue={t.price ?? ""} placeholder={t.quote_from ? `quote, from ${t.quote_from}` : "quote"} onBlur={(e) => { const v = e.target.value.replace(/\D/g, ""); if ((v ? +v : null) !== t.price) onSave(t.id, v ? +v : null, t.days); }} /> : t.price != null ? rup(t.price) : `Quote${t.quote_from ? `, from ${rup(t.quote_from)}` : ""}`}</td>
                <td>{editable ? <input className="pin s" defaultValue={t.days ?? ""} onBlur={(e) => { const v = e.target.value.replace(/\D/g, ""); if ((v ? +v : null) !== t.days) onSave(t.id, t.price, v ? +v : null); }} /> : t.days ?? "—"}</td>{k === "review" && <td>{t.pages_covered ?? "—"}</td>}</tr>
            ))}</tbody></table></div></div>
      ))}
    </>
  );
}
