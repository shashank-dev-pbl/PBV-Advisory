// Pure data and helpers — safe to import from client components. The server enforces the same
// table (see lib/session.ts pageGate and the role checks in every Server Action); this file only
// describes it so the menu can show locks.

export type Who = "founder" | "external" | "pba" | "admin";

export type PageKey =
  | "home" | "dashboard"
  | "close" | "legal" | "cmaster" | "files" | "dataroom" | "companies" | "people" | "outreach";

export const PAGES: Record<PageKey, { label: string; href: string }> = {
  home: { label: "Companies", href: "/home" },
  dashboard: { label: "Dashboard", href: "/dashboard" },
  close: { label: "Monthly close", href: "/monthly" },
  legal: { label: "Legal", href: "/legal" },
  cmaster: { label: "Company master", href: "/company-master" },
  files: { label: "Files delivered", href: "/files" },
  dataroom: { label: "Data room", href: "/dataroom" },
  companies: { label: "Companies", href: "/admin/companies" },
  people: { label: "People & Access", href: "/admin/people" },
  outreach: { label: "Outreach", href: "/outreach" },
};

export const ACCESS: Record<PageKey, Who[]> = {
  home: ["external", "pba", "admin"],
  dashboard: ["founder", "external", "pba", "admin"],
  close: ["founder", "external", "pba", "admin"],
  legal: ["founder", "pba", "admin"],       // an external practitioner sees the lock, never the page
  cmaster: ["founder", "external", "pba", "admin"],
  files: ["founder", "external", "pba", "admin"],
  dataroom: ["founder", "external", "pba", "admin"],
  companies: ["admin"],
  people: ["admin"],
  outreach: ["pba", "admin"],
};

export const LANDING: Record<Who, PageKey> = {
  founder: "dashboard",
  external: "close",
  pba: "home",
  admin: "companies",
};

export const WHO_LABEL: Record<Who, string> = {
  founder: "Founder",
  external: "External practitioner",
  pba: "PBA practitioner",
  admin: "PBA admin",
};

export function canOpen(who: Who, page: PageKey): boolean {
  return ACCESS[page].includes(who);
}

// "/master/month" and friends map back to a page key so the menu can highlight and the gate can check.
export function pageKeyForPath(pathname: string): PageKey | null {
  const entries = Object.entries(PAGES) as [PageKey, { href: string }][];
  const hit = entries.find(([, p]) => pathname === p.href || pathname.startsWith(p.href + "/"));
  return hit ? hit[0] : null;
}

export const COMPANY_COOKIE = "pba_company";
export const DEV_AS_COOKIE = "dev_as";
