import "server-only";

// The two small AI jobs in the outreach sequence: one line about a company, and a label for a reply. Plain fetch, no SDK.
// Without ANTHROPIC_API_KEY on the deployment every function returns null and the page says so; nothing else breaks.
const MODEL = process.env.OUTREACH_AI_MODEL || "claude-haiku-5-5";

export const aiConfigured = () => !!process.env.ANTHROPIC_API_KEY;

export async function ask(system: string, user: string, maxTokens = 200): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { content?: { type: string; text?: string }[] };
    return (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
  } catch {
    return null;
  }
}

// The company line ({{hook}}). Returns "" when the articles give nothing specific, null when the AI is not available.
export async function writeHook(prompt: string, facts: { company: string; description: string | null; sector: string | null; round: string | null; amount: string | null; investors: string | null; articles: string[] }): Promise<string | null> {
  const body = [
    `Company: ${facts.company}`, `What they do: ${facts.description ?? "unknown"}`, `Sector: ${facts.sector ?? "unknown"}`,
    `Round: ${facts.round ?? "unknown"} ${facts.amount ?? ""}`, `Investors: ${facts.investors ?? "unknown"}`,
    "", "Articles that confirmed the round:", ...facts.articles.map((a, i) => `--- article ${i + 1} ---\n${a.slice(0, 2500)}`),
  ].join("\n");
  const out = await ask(prompt, body, 120);
  if (out === null) return null;
  return out.replace(/^["'\s]+|["'\s]+$/g, "").split("\n")[0].slice(0, 220);
}

export async function labelReply(prompt: string, reply: string): Promise<string | null> {
  const out = await ask(`${prompt}\nAnswer with the label only.`, reply, 20);
  return out ? out.replace(/[^A-Za-z ]/g, "").trim() : null;
}

export async function draftReply(company: string, founder: string, label: string, theirReply: string, sent: string): Promise<string | null> {
  return ask(
    "You draft a short LinkedIn reply for Swetha, co-founder of Prime Bottomline Advisory (fractional CFO team for funded founders). Plain English, 2 to 4 sentences, no emojis, no praise words. Suggest a 20-minute call when they are interested. Output the reply only.",
    `Company: ${company}\nFounder: ${founder}\nHow the reply reads: ${label}\nWhat we sent:\n${sent}\n\nTheir reply:\n${theirReply}`,
    220,
  );
}
