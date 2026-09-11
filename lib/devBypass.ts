// TEMPORARY — dev-only login bypass while phone OTP is blocked on Twilio.
// Split into its own file (no server-only imports) so client components —
// e.g. hiding the sign-out button — can read the flag without pulling
// next/headers into the client bundle. lib/auth.ts re-exports this same
// value for server code. MUST be reverted (set to false) before Twilio
// ships or before any deploy meant to be publicly reachable — this exposes
// Xploro's real data to anyone holding the public anon key, not just this app.
export const DEV_BYPASS_AUTH = true;
