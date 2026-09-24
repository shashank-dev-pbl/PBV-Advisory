import { getCurrentAppUser } from "@/lib/auth";
import { DEV_BYPASS_AUTH } from "@/lib/devBypass";
import type { AppUser, Role } from "@/lib/types";

export async function requireAppUser(): Promise<AppUser> {
  const user = await getCurrentAppUser();
  if (!user) throw new Error("Not signed in");
  return user;
}

// Every page route already skips its own role redirect under DEV_BYPASS_AUTH
// (there's only one fixed test identity, so it has to be allowed to act as
// any role) — this mirrors that same exception for Server Actions, which
// have no such bypass otherwise and would 403 the single test identity.
export async function requireRole(...roles: Role[]): Promise<AppUser> {
  const user = await requireAppUser();
  if (!DEV_BYPASS_AUTH && !roles.includes(user.role)) throw new Error("Not authorized for this action");
  return user;
}
