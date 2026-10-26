import { createHmac, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";

// Razorpay's signed callback — the only thing that can mark a real payment paid. The browser is never trusted for it.
// Needs RAZORPAY_WEBHOOK_SECRET and SUPABASE_SERVICE_ROLE_KEY. Until they are set this answers 503 and nothing changes.
export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET, service = process.env.SUPABASE_SERVICE_ROLE_KEY, url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!secret || !service || !url) return new Response("Payments are not switched on yet", { status: 503 });
  const body = await req.text();
  const sig = req.headers.get("x-razorpay-signature") ?? "";
  const want = createHmac("sha256", secret).update(body).digest("hex");
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return new Response("Bad signature", { status: 400 });
  const event = JSON.parse(body) as { event: string; payload?: { payment?: { entity?: { id: string; order_id: string; status: string } } } };
  const pay = event.payload?.payment?.entity;
  if (!["payment.captured", "order.paid"].includes(event.event) || !pay?.order_id) return new Response("Ignored", { status: 200 });
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: order } = await admin.from("legal_order").select("id").eq("gateway_order_id", pay.order_id).maybeSingle();
  if (!order) return new Response("Unknown order", { status: 404 });
  const { error } = await admin.rpc("legal_confirm_order", { p_order: order.id, p_ref: pay.id });
  return error ? new Response(error.message, { status: 500 }) : new Response("OK", { status: 200 });
}
