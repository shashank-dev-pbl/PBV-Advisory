"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/permissions";
import { guarded } from "@/lib/actionResult";
import { can, canEditPrices, canPay, type LegalStatus, type LegalWho } from "@/lib/legal/model";

// Every rule here is also in the database (20261026_legal.sql): these actions give clean messages, the triggers make the rules hold
// even for a direct call. An external practitioner is refused before anything else.
async function ctx() {
  const user = await requireRole("founder", "pba");           // admin acts as pba; an external practitioner (role practitioner) never gets in
  const supabase = await createClient();
  const { data: admin } = await supabase.rpc("is_platform_admin");
  const who: LegalWho = user.role === "founder" ? "founder" : admin ? "admin" : "pba";
  return { user, supabase, who, by: user.name ?? "Someone" };
}
const refresh = () => { revalidatePath("/legal"); revalidatePath("/files"); revalidatePath("/dashboard"); revalidatePath("/", "layout"); };
type Client = Awaited<ReturnType<typeof createClient>>;
async function request(supabase: Client, id: string) {
  const { data, error } = await supabase.from("legal_request").select("id, company_id, status, type_id").eq("id", id).maybeSingle();
  if (error || !data) throw new Error("You don't have access to this request");
  return data as { id: string; company_id: string; status: LegalStatus; type_id: string };
}
const need = (ok: boolean, why: string) => { if (!ok) throw new Error(why); };

async function _createRequest(i: { typeId: string; title: string; party?: string; need?: string; neededBy?: string; pages?: number | null; file?: { storagePath: string; filename: string } }) {
  const { user, supabase, who, by } = await ctx();
  need(who === "founder" || who === "pba" || who === "admin", "You can't make a request");
  if (!i.title.trim()) throw new Error("Give the request a name");
  if (i.file && !i.file.storagePath.startsWith(`${user.company_id}/legal-in/`)) throw new Error("That file is not in this company's folder");
  const { data: t } = await supabase.from("legal_type").select("kind").eq("id", i.typeId).maybeSingle();
  if (!t) throw new Error("Unknown document type");
  if (t.kind === "review" && !i.file) throw new Error("Attach the document to review");
  const { data, error } = await supabase.from("legal_request").insert({
    company_id: user.company_id, type_id: i.typeId, title: i.title.trim().slice(0, 140), party: i.party?.trim().slice(0, 140) || null, need: i.need?.trim().slice(0, 2000) || null,
    needed_by: i.neededBy || null, pages: i.pages ?? null, created_by: user.id, created_by_name: by, created_by_role: who,
  }).select("id, status").single();
  if (error || !data) throw new Error(error?.message ?? "Could not create the request");
  if (i.file) await supabase.from("legal_file").insert({ request_id: data.id, storage_path: i.file.storagePath, filename: i.file.filename, pages: i.pages ?? null, by_name: by });
  refresh();
  return data as { id: string; status: LegalStatus };
}

async function _sendQuote(id: string, amount: number, note: string) {
  const { supabase, who, by } = await ctx();
  const r = await request(supabase, id);
  need(can(who, r.status, "price"), "Only Prime Bottomline can send a price, and only while it is waiting for one");
  need(Number.isFinite(amount) && amount > 0, "Enter the price before GST");
  const { error } = await supabase.from("legal_request").update({ quote_amount: Math.round(amount), quote_note: note.trim().slice(0, 600) || null, quoted_by_name: by, quoted_at: new Date().toISOString(), status: "pay" }).eq("id", id).eq("status", "quote");
  if (error) throw new Error(error.message);
  refresh();
}

// Start a payment for what is owed (the database works out the amount and the GST, never the browser). With no gateway keys configured
// this is the built-in TEST gateway; with Razorpay keys it opens a real order and only the gateway's signed callback marks it paid.
async function _startPayment(id: string, purpose: "advance" | "extra") {
  const { user, supabase, who } = await ctx();
  const r = await request(supabase, id);
  need(canPay(who), "Only the founder can pay");
  need(purpose === "advance" ? r.status === "pay" : r.status === "extra", "This request is not waiting for a payment");
  const live = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  const { data, error } = await supabase.from("legal_order").insert({ request_id: id, company_id: r.company_id, purpose, amount: 1, gst: 0, gateway: live ? "razorpay" : "test", created_by: user.id }).select("id, amount, gst, gateway").single();
  if (error || !data) throw new Error(error?.message ?? "Could not start the payment");
  let gatewayOrderId: string | null = null;
  if (live) {
    const total = Math.round((Number(data.amount) + Number(data.gst)) * 100);
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}` },
      body: JSON.stringify({ amount: total, currency: "INR", receipt: data.id.slice(0, 40), notes: { request: id, purpose } }),
    });
    if (!res.ok) throw new Error("The payment gateway did not accept the order. Try again in a moment.");
    gatewayOrderId = ((await res.json()) as { id: string }).id;
    await supabase.from("legal_order").update({ gateway_order_id: gatewayOrderId }).eq("id", data.id);
  }
  return { orderId: data.id as string, gateway: data.gateway as "test" | "razorpay", amount: Number(data.amount), gst: Number(data.gst), gatewayOrderId, keyId: live ? process.env.RAZORPAY_KEY_ID ?? null : null };
}

// TEST gateway only: nothing moves, and the receipt says so. A real gateway can never be confirmed from here.
async function _confirmTestPayment(orderId: string) {
  const { supabase } = await ctx();
  const { error } = await supabase.rpc("legal_confirm_order", { p_order: orderId, p_ref: `TEST-${randomBytes(5).toString("hex").toUpperCase()}` });
  if (error) throw new Error(error.message);
  refresh();
}

async function _recordFinished(id: string, storagePath: string, filename: string) {
  const { user, supabase, who } = await ctx();
  const r = await request(supabase, id);
  need(can(who, r.status, "finish"), "Only Prime Bottomline can upload the finished document, while the work is in progress");
  need(storagePath.startsWith(`${user.company_id}/legal-out/${id}/`), "That file is not in this request's folder");
  const { error } = await supabase.from("legal_request").update({ ready_path: storagePath, ready_filename: filename, ready_at: new Date().toISOString() }).eq("id", id).eq("status", "progress");
  if (error) throw new Error(error.message);
  refresh();
}

async function _proposeExtra(id: string, what: string, amount: number, reason: string) {
  const { supabase, who, by } = await ctx();
  const r = await request(supabase, id);
  need(can(who, r.status, "propose_extra"), "Only Prime Bottomline can propose extra work, while the work is in progress");
  need(!!what.trim() && !!reason.trim() && Number.isFinite(amount) && amount > 0, "Say what, how much, and why — the founder reads the reason");
  const e = await supabase.from("legal_extra").insert({ request_id: id, what: what.trim().slice(0, 140), amount: Math.round(amount), reason: reason.trim().slice(0, 600), by_name: by });
  if (e.error) throw new Error(e.error.message);
  const u = await supabase.from("legal_request").update({ status: "extra" }).eq("id", id).eq("status", "progress");
  if (u.error) throw new Error(u.error.message);
  refresh();
}

async function _deliver(id: string, findings?: { level: "High" | "Medium" | "Low"; text: string }[]) {
  const { supabase, who } = await ctx();
  const r = await request(supabase, id);
  need(can(who, r.status, "deliver"), "Only Prime Bottomline can deliver, once the finished document is up and no extra work is waiting");
  const clean = (findings ?? []).filter((f) => f.text.trim()).map((f) => ({ level: f.level, text: f.text.trim().slice(0, 400) }));
  const { error } = await supabase.from("legal_request").update({ status: "done", findings: clean.length ? clean : null }).eq("id", id).eq("status", "progress");
  if (error) throw new Error(error.message);
  refresh();
}

async function _addNote(id: string, text: string) {
  const { supabase, who, by } = await ctx();
  const r = await request(supabase, id);
  need(can(who, r.status, "note") && !!text.trim(), "Write something first");
  const { error } = await supabase.from("legal_note").insert({ request_id: id, by_name: by, by_role: who === "founder" ? "founder" : "pba", text: text.trim().slice(0, 1500) });
  if (error) throw new Error(error.message);
  revalidatePath("/legal");
}

async function _setPrice(typeId: string, price: number | null, days: number | null) {
  const { supabase, who } = await ctx();
  need(canEditPrices(who), "Only a PBA admin can change prices");
  if (price != null && !(price > 0)) throw new Error("A price must be more than zero, or empty for a quote");
  const { error } = await supabase.from("legal_type").update({ price, days }).eq("id", typeId);
  if (error) throw new Error(error.message);
  refresh();
}

// The finished document is released only once the request is delivered (and to Prime Bottomline before then); the database enforces it too.
async function _fileUrl(id: string, which: "ready" | "attached", path?: string) {
  const { supabase, who } = await ctx();
  const r = await request(supabase, id);
  let target = path ?? "";
  if (which === "ready") {
    need(can(who, r.status, "download_finished"), "The finished document is released when the extra work is paid");
    const { data } = await supabase.from("legal_request").select("ready_path").eq("id", id).maybeSingle();
    target = data?.ready_path ?? "";
  } else {
    const { data } = await supabase.from("legal_file").select("storage_path").eq("request_id", id).eq("storage_path", target).maybeSingle();
    need(!!data, "That file is not part of this request");
  }
  need(!!target, "There is no file yet");
  const { data, error } = await supabase.storage.from("docs").createSignedUrl(target, 120);
  if (error || !data) throw new Error("Could not open the file");
  return data.signedUrl;
}

export async function createRequest(...a: Parameters<typeof _createRequest>) { return guarded(() => _createRequest(...a)); }
export async function sendQuote(...a: Parameters<typeof _sendQuote>) { return guarded(() => _sendQuote(...a)); }
export async function startPayment(...a: Parameters<typeof _startPayment>) { return guarded(() => _startPayment(...a)); }
export async function confirmTestPayment(...a: Parameters<typeof _confirmTestPayment>) { return guarded(() => _confirmTestPayment(...a)); }
export async function recordFinished(...a: Parameters<typeof _recordFinished>) { return guarded(() => _recordFinished(...a)); }
export async function proposeExtra(...a: Parameters<typeof _proposeExtra>) { return guarded(() => _proposeExtra(...a)); }
export async function deliverRequest(...a: Parameters<typeof _deliver>) { return guarded(() => _deliver(...a)); }
export async function addNote(...a: Parameters<typeof _addNote>) { return guarded(() => _addNote(...a)); }
export async function setPrice(...a: Parameters<typeof _setPrice>) { return guarded(() => _setPrice(...a)); }
export async function legalFileUrl(...a: Parameters<typeof _fileUrl>) { return guarded(() => _fileUrl(...a)); }
