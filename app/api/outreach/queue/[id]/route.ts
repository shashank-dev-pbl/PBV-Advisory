import { extensionDb, fail, keyOf } from "@/lib/outreachApi";

// Update one lead. Reached by the extension as PATCH /api/queue/:id.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !/^\d+$/.test(id)) return Response.json({ error: "Bad request" }, { status: 400 });
  const { data, error } = await extensionDb().rpc("outreach_queue_patch", { p_key: keyOf(req), p_id: Number(id), p_patch: body });
  if (error) return /check constraint|stage/i.test(error.message) ? Response.json({ error: "Invalid stage" }, { status: 400 }) : fail(error);
  return Response.json({ item: data, record: null });
}
