"use client";

import { useState, useTransition } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Lock, Menu, X } from "lucide-react";
import { PAGES, canOpen, type PageKey, type Who } from "@/lib/access";
import { switchCompany } from "./actions";

type Props = {
  who: Who;
  companies: { id: string; name: string; status: string }[];
  companyId: string | null;
  lateMonths: number;
  legalBadge: { n: number; label: string } | null;
  masterDone: number | null;
  children: React.ReactNode;
};

// Shows a small spinner on the menu item the moment it is clicked, until the page has loaded.
function LinkPending() {
  const { pending } = useLinkStatus();
  return pending ? <span className="navspin" aria-label="Loading" role="status" /> : null;
}

// Only the pages this person can open appear at all — no greyed-out, locked entries.
function NavItem({ page, who, pathname, extra, label, href, matchPrefix, sub, onNavigate }: {
  page: PageKey; who: Who; pathname: string; extra?: React.ReactNode; label?: string; href?: string; matchPrefix?: string; sub?: boolean; onNavigate: () => void;
}) {
  if (!canOpen(who, page)) return null;
  const p = PAGES[page];
  const on = matchPrefix ? pathname.startsWith(matchPrefix) : pathname === p.href || pathname.startsWith(p.href + "/");
  return (
    <Link
      href={href ?? p.href}
      onClick={onNavigate}
      className="flex items-center justify-between text-[13.5px]"
      style={{
        padding: sub ? "7px 12px" : "8px 12px",
        borderRadius: 7,
        color: on ? "var(--paper)" : "var(--ink)",
        background: on ? "var(--bottomline-green)" : "transparent",
        fontWeight: on ? 700 : 500,
      }}
    >
      <span>{label ?? p.label}</span>
      <span className="flex items-center gap-1.5">{extra}<LinkPending /></span>
    </Link>
  );
}

export default function PortalShell({ who, companies, companyId, lateMonths, legalBadge, masterDone, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [switching, startTransition] = useTransition();
  const close = () => setOpen(false);

  const sidebar = (
    <nav className="flex h-full flex-col gap-0.5 p-3" style={{ background: "var(--paper-deep)", borderRight: "1px solid var(--rule)" }}>
      <p className="eyebrow px-3 pb-2 pt-1" style={{ color: "var(--bottomline-green)" }}>Prime Bottomline Advisory</p>

      <div className="px-3 pb-3">
        <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--ink-secondary)" }}>Company{switching && <><span className="navspin" role="status" aria-label="Switching" /><span className="normal-case tracking-normal">Switching…</span></>}</p>
        {companies.length > 1 ? (
          <select
            className="input-field" disabled={switching} aria-busy={switching}
            style={{ minHeight: 34, padding: "6px 8px", fontSize: 13 }}
            value={companyId ?? ""}
            onChange={(e) => startTransition(async () => {
              const id = e.target.value;
              await switchCompany(id);
              // On the admin Companies page, follow the selector so the page always shows the company chosen here.
              if (pathname.startsWith("/admin/companies")) router.push(`/admin/companies?c=${id}`);
              else router.refresh();
              close();
            })}
          >
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : (
          <p className="text-[13.5px] font-bold" style={{ color: "var(--ink)" }}>{companies[0]?.name ?? "No company yet"}</p>
        )}
      </div>

      {who !== "founder" && <NavItem page={who === "admin" ? "companies" : "home"} who={who} pathname={pathname} onNavigate={close} label="Companies" matchPrefix={who === "admin" ? "/admin/companies" : "/home"} />}
      <NavItem page="dashboard" who={who} pathname={pathname} onNavigate={close} />
      <NavItem
        page="close" who={who} pathname={pathname} onNavigate={close}
        extra={lateMonths > 0 ? <span className="rounded-full px-1.5 text-[10.5px] font-bold" style={{ background: "#fbe9e7", color: "#b3261e" }}>{lateMonths} late</span> : null}
      />
      {who === "external" ? (
        <span className="flex items-center justify-between text-[13.5px]" style={{ padding: "8px 12px", borderRadius: 7, color: "var(--ink-secondary)", cursor: "not-allowed" }} title="Legal is not open to external practitioners">
          <span>Legal</span><Lock size={13} strokeWidth={2} />
        </span>
      ) : (
        <NavItem page="legal" who={who} pathname={pathname} onNavigate={close} extra={legalBadge ? <span className="rounded-full px-1.5 text-[10.5px] font-bold" style={{ background: "#fbe9e7", color: "#b3261e" }}>{legalBadge.n} {legalBadge.label}</span> : null} />
      )}
      <NavItem page="dataroom" who={who} pathname={pathname} onNavigate={close} />
      <NavItem page="files" who={who} pathname={pathname} onNavigate={close} />
      <NavItem
        page="cmaster" who={who} pathname={pathname} onNavigate={close}
        extra={masterDone !== null ? <span className="text-[11px] font-bold" style={{ color: pathname.startsWith("/company-master") ? "var(--paper)" : "var(--ink-secondary)" }}>{masterDone}/12</span> : null}
      />
      {canOpen(who, "people") && (
        <>
          <div className="my-2" style={{ borderTop: "1px solid var(--rule)" }} />
          <p className="px-3 pb-0.5 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--ink-secondary)" }}>Admin</p>
          <NavItem page="people" who={who} pathname={pathname} onNavigate={close} />
        </>
      )}
    </nav>
  );

  return (
    <div className="relative flex min-h-screen" style={{ background: "var(--paper)" }}>
      <aside className="sticky top-0 hidden h-screen w-[236px] flex-shrink-0 md:block">{sidebar}</aside>

      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="absolute left-3 top-3 z-30 flex h-9 w-9 items-center justify-center md:hidden"
        style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 7 }}
      >
        <Menu size={18} strokeWidth={1.75} />
      </button>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" style={{ background: "rgba(0,0,0,0.35)" }} onClick={close}>
          <div className="h-full w-[260px]" onClick={(e) => e.stopPropagation()}>
            <button onClick={close} aria-label="Close menu" className="absolute right-3 top-3 z-50 text-white md:hidden"><X size={20} /></button>
            {sidebar}
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
