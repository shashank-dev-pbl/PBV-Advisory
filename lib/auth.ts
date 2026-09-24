import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { AppUser } from "@/lib/types";
import { DEV_BYPASS_AUTH } from "@/lib/devBypass";

export { DEV_BYPASS_AUTH };

const XPLORO_COMPANY_ID = "646035b7-140d-4a22-9540-67d72f7afa55";

// Three real, pre-provisioned test accounts — one per role — so the bypass
// can satisfy invariants that need genuinely distinct identities (e.g. "the
// account that submitted a month can't also verify it"). middleware.ts picks
// which one applies per request, based on which desk's path is being hit.
const DEV_BYPASS_USERS: Record<"founder" | "practitioner" | "pba", AppUser> = {
  founder: {
    id: "c1e474bf-f2bb-4c1b-8fe4-2b0794f409de",
    email: "shashank+founder@primebottomline.vc",
    name: "Xploro Founder",
    position: "Founder",
    role: "founder",
    company_id: XPLORO_COMPANY_ID,
    phone: null,
    auth_user_id: null,
    can_verify: false,
    can_publish: false,
    firm_name: null,
  },
  practitioner: {
    id: "8ec4cd6e-e017-46e4-8ea6-e1abc69597d7",
    email: "shashank@primebottomline.vc",
    name: "Shashank",
    position: "Audit Partner",
    role: "practitioner",
    company_id: XPLORO_COMPANY_ID,
    phone: null,
    auth_user_id: null,
    can_verify: false,
    can_publish: false,
    firm_name: null,
  },
  pba: {
    id: "c42a42df-479d-4018-a1df-2dc3332844dd",
    email: "swetha@primebottomline.vc",
    name: "Swetha",
    position: "PBA Reviewer",
    role: "pba",
    company_id: XPLORO_COMPANY_ID,
    phone: null,
    auth_user_id: null,
    can_verify: true,
    can_publish: true,
    firm_name: null,
  },
};

// Identity resolution and one-time account-claiming both happen inside the
// current_app_user() SQL function (SECURITY DEFINER) — see the Build 3 phase 1
// migration. There is no auto-registration here anymore: a phone number must
// already exist on an app_user row (provisioned by an admin) or this returns null.
export async function getCurrentAppUser(): Promise<AppUser | null> {
  if (DEV_BYPASS_AUTH) {
    // Set by middleware.ts from the request path — which desk you're on
    // decides which of the three real test accounts you are.
    const role = (await headers()).get("x-dev-bypass-role") as "founder" | "practitioner" | "pba" | null;
    return DEV_BYPASS_USERS[role ?? "practitioner"];
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("current_app_user");
  if (error || !data || !(data as AppUser).id) return null;
  return data as AppUser;
}

export function needsOnboarding(user: AppUser): boolean {
  return !user.name || !user.position;
}
