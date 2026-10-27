import { extensionDb, fail, keyOf } from "@/lib/outreachApi";

// The older logger could add a contact record by hand. Advisory outreach has no separate contact list, so this only checks the
// key and answers; nothing is stored. Reached as POST /api/activity/create-record.
export async function POST(req: Request) {
  const { error } = await extensionDb().rpc("outreach_queue_counts", { p_key: keyOf(req) });
  return error ? fail(error) : Response.json({ ok: true, matched: false });
}
