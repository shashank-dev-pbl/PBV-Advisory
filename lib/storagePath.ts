// Supabase Storage object keys only allow a narrow ASCII set — real filenames
// (em dashes, accents, spaces, unicode) get rejected with "Invalid key". Keep the
// original filename for display (stored separately in the DB) and sanitize only
// the path segment used as the storage key.
export function safeStorageSegment(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  const name = lastDot > 0 ? filename.slice(0, lastDot) : filename;
  const ext = lastDot > 0 ? filename.slice(lastDot) : "";

  const safeName = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, "");

  return (safeName || "file") + safeExt;
}
