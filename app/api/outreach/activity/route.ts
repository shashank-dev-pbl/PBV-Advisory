import { extensionDb, fail, keyOf } from "@/lib/outreachApi";

// The extension reports what it did (connection sent, message sent, reply seen). Reached as POST /api/activity.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "Bad request" }, { status: 400 });
  const { data, error } = await extensionDb().rpc("outreach_event_add", { p_key: keyOf(req), p_event: body });
  return error ? fail(error) : Response.json(data);
}
