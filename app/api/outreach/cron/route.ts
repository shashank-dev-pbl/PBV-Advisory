import { runScan } from "@/lib/outreachEngine";

export const maxDuration = 120;

// The daily scan. Vercel calls it on the schedule in vercel.json and sends CRON_SECRET as a bearer token.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await runScan());
}
