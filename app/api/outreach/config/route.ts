import { extensionDb, fail, keyOf } from "@/lib/outreachApi";
import { mergeSettings } from "@/lib/outreach";

// The rules, the four messages and the sending limits as set on the Outreach pages. The extension reads this before every
// round instead of keeping its own copy. Reached by the extension as GET /api/config.
export async function GET(req: Request) {
  const { data, error } = await extensionDb().rpc("outreach_config_for_bot", { p_key: keyOf(req) });
  if (error) return fail(error);
  const s = mergeSettings(data);
  return Response.json({ cfg: s.cfg, templates: s.tpl });
}
