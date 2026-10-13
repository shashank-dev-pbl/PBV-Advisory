// Dev-only sign-in bypass: the four test accounts and the "view as" strip stand in for phone sign-in.
// OFF by default. It turns on only when NEXT_PUBLIC_DEV_BYPASS_AUTH is exactly "true" in the environment
// (set it for local development in .env.local, never for Production). With it on, anyone holding the public
// anon key can act as any role, so it must never be enabled on a deployment people can reach.
// Kept in its own file (no server-only imports) so client components can read the flag.
export const DEV_BYPASS_AUTH = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true";
