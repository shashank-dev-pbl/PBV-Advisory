import { extensionDb, fail, keyOf } from "@/lib/outreachApi";

// The extension says whether it sent that reply. Reached as POST /api/outbox/:id with { ok, error? }.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !/^\d+$/.test(id)) return Response.json({ error: "Bad request" }, { status: 400 });
  const { error } = await extensionDb().rpc("outreach_outbox_done", { p_key: keyOf(req), p_id: Number(id), p_ok: !!body.ok, p_error: body.error ?? null });
  return error ? fail(error) : Response.json({ ok: true });
}
