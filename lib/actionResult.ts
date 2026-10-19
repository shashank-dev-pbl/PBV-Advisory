// A production build hides the text of any error thrown by a Server Action behind a generic message. Actions the
// user can trip over on purpose (a refused grant, a bad GSTIN) return their reason instead, and the client throws it.
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function guarded<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

export function unwrap<T>(r: ActionResult<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}
