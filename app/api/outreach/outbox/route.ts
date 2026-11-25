import { extensionDb, fail, keyOf } from "@/lib/outreachApi";

// The next reply written on the portal that still has to be sent from LinkedIn. Reached as GET /api/outbox.
export async function GET(req: Request) {
  const { data, error } = await extensionDb().rpc("outreach_outbox_next", { p_key: keyOf(req) });
  return error ? fail(error) : Response.json({ items: data ?? [] });
}
