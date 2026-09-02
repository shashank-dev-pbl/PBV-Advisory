// Direct Resend API send for transactional alerts (separate from Supabase Auth's SMTP,
// which only handles magic-link emails). Requires RESEND_API_KEY in the environment —
// silently no-ops if it isn't set, so this degrades gracefully rather than breaking publish.
export async function sendEmail({ to, subject, html }: { to: string[]; subject: string; html: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || to.length === 0) return;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Prime Bottomline Advisory <onboarding@resend.dev>",
      to,
      subject,
      html,
    }),
  });
}
