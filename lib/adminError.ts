// In a production build Next hides the text of an error thrown by a Server Action and shows only a generic
// "error occurred in the Server Components render" (React #441). The admin pages' real refusals are
// written for people, so when that generic text arrives, say what it almost always is.
export function adminError(e: unknown, fallback: string): string {
  const msg = e instanceof Error ? e.message : "";
  if (!msg) return fallback;
  if (/Server Components render|React error #441|digest/i.test(msg)) {
    return "The server refused that change and did not say why. Reload the page and try again; if it keeps happening, tell Shashank.";
  }
  return msg;
}
