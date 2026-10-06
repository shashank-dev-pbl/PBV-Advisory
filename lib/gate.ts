import { redirect } from "next/navigation";
import { getSession, needsOnboarding, type Session } from "@/lib/auth";
import { canOpen, type PageKey } from "@/lib/access";

// Every portal page starts with this. Signed out -> the sign-in page. Signed in but not allowed on
// this page -> `locked`, and the page renders the one plain refusal instead of any data. Typing the
// address into the bar goes through here exactly like clicking the menu does.
export async function pageGate(page: PageKey): Promise<{ session: Session; locked: boolean }> {
  const session = await getSession();
  if (!session.user || !session.who) redirect("/login");
  if (needsOnboarding(session.user)) redirect("/onboarding");
  return { session, locked: !canOpen(session.who, page) };
}
