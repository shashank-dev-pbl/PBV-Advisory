// Pure data and helpers — safe to import from client components. The server enforces the same
// table (see lib/session.ts pageGate and the role checks in every Server Action); this file only
// describes it so the menu can show locks.

export type Who = "founder" | "external" | "pba" | "admin";

export type PageKey =
  | "home" | "dashboard" | "up-once" | "up-month" | "up-qy"
  | "close" | "filings" | "files" | "dataroom" | "companies" | "people";

export const PAGES: Record<PageKey, { label: string; href: string }> = {
  home: { label: "My companies", href: "/home" },
  dashboard: { label: "Dashboard", href: "/dashboard" },
  "up-once": { label: "One-time", href: "/uploads/once" },
  "up-month": { label: "Monthly", href: "/uploads/month" },
  "up-qy": { label: "Quarterly & yearly", href: "/uploads/qy" },
  close: { label: "Monthly close", href: "/close" },
  filings: { label: "Filings", href: "/filings" },
  files: { label: "Files delivered", href: "/files" },
  dataroom: { label: "Data room", href: "/dataroom" },
  companies: { label: "Companies", href: "/admin/companies" },
  people: { label: "People & access", href: "/admin/people" },
};

export const ACCESS: Record<PageKey, Who[]> = {
  home: ["pba", "admin"],
  dashboard: ["founder", "external", "pba", "admin"],
  "up-once": ["founder", "external", "pba", "admin"],
  "up-month": ["founder", "external", "pba", "admin"],
  "up-qy": ["founder", "external", "pba", "admin"],
  close: ["external", "pba", "admin"],
  filings: ["founder", "external", "pba", "admin"],
  files: ["founder", "external", "pba", "admin"],
  dataroom: ["founder", "external", "pba", "admin"],
  companies: ["admin"],
  people: ["admin"],
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

// "/uploads/month" and friends map back to a page key so the menu can highlight and the gate can check.
export function pageKeyForPath(pathname: string): PageKey | null {
  const entries = Object.entries(PAGES) as [PageKey, { href: string }][];
  const hit = entries.find(([, p]) => pathname === p.href || pathname.startsWith(p.href + "/"));
  return hit ? hit[0] : null;
}

export const COMPANY_COOKIE = "pba_company";
export const DEV_AS_COOKIE = "dev_as";
