// In a production build Next hides the text of an error thrown by a Server Action and shows only a generic
// "error occurred in the Server Components render" (React #441). The admin pages' real refusals are
// written for people, so when that generic text arrives, say what it almost always is.
export function adminError(e: unknown, fallback: string): string {
  const msg = e instanceof Error ? e.message : "";
  if (!msg) return fallback;
  if (/Server Components render|React error #441|digest/i.test(msg)) {
    return "That change was refused. While real sign-in is off, the database blocks admin changes unless they are switched on for testing. If you are an admin testing, ask for admin writes to be opened; otherwise check the details and try again.";
  }
  return msg;
}
