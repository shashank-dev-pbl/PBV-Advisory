import { extensionDb, fail, keyOf } from "@/lib/outreachApi";

// ?summary=1 -> counts per stage. ?stage=a,b&limit=n -> leads, oldest first. Reached by the extension as /api/queue.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const db = extensionDb();
  if (url.searchParams.get("summary")) {
    const { data, error } = await db.rpc("outreach_queue_counts", { p_key: keyOf(req) });
    return error ? fail(error) : Response.json({ counts: data });
  }
  const stages = (url.searchParams.get("stage") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const { data, error } = await db.rpc("outreach_queue_list", { p_key: keyOf(req), p_stages: stages, p_limit: Number(url.searchParams.get("limit")) || 20 });
  return error ? fail(error) : Response.json({ items: data ?? [] });
}

// Companies imported from the funding dashboard. Reached as POST /api/queue.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const companies = Array.isArray(body?.companies) ? body.companies : [];
  if (companies.length === 0) return Response.json({ error: "No companies" }, { status: 400 });
  const { data, error } = await extensionDb().rpc("outreach_queue_import", { p_key: keyOf(req), p_companies: companies });
  return error ? fail(error) : Response.json(data);
}
