import { getCurrentAppUser } from "@/lib/auth";
import type { AppUser, Role } from "@/lib/types";

export async function requireAppUser(): Promise<AppUser> {
  const user = await getCurrentAppUser();
  if (!user) throw new Error("Not signed in");
  return user;
}

export async function requireRole(...roles: Role[]): Promise<AppUser> {
  const user = await requireAppUser();
  if (!roles.includes(user.role)) throw new Error("Not authorized for this action");
  return user;
}
