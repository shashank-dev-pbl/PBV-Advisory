"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { COMPANY_COOKIE } from "@/lib/access";

// Only a company the person has an active grant on can be selected; anything else is ignored.
export async function switchCompany(companyId: string) {
  const session = await getSession();
  if (!session.companies.some((c) => c.id === companyId)) return;
  const jar = await cookies();
  jar.set(COMPANY_COOKIE, companyId, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}
