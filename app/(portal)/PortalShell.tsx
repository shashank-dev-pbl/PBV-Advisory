"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
import { PAGES, canOpen, type PageKey, type Who } from "@/lib/access";
import { switchCompany } from "./actions";

type Props = {
  who: Who;
  companies: { id: string; name: string; status: string }[];
  companyId: string | null;
  closeWaiting: number;
  children: React.ReactNode;
};

// Only the pages this person can open appear at all — no greyed-out, locked entries.
function NavItem({ page, who, pathname, extra, label, href, matchPrefix, onNavigate }: {
  page: PageKey; who: Who; pathname: string; extra?: React.ReactNode; label?: string; href?: string; matchPrefix?: string; onNavigate: () => void;
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
        padding: "8px 12px",
        borderRadius: 7,
        color: on ? "var(--paper)" : "var(--ink)",
        background: on ? "var(--bottomline-green)" : "transparent",
        fontWeight: on ? 700 : 500,
      }}
    >
      <span>{label ?? p.label}</span>
      {extra}
    </Link>
  );
}

export default function PortalShell({ who, companies, companyId, closeWaiting, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const close = () => setOpen(false);

  const sidebar = (
    <nav className="flex h-full flex-col gap-0.5 p-3" style={{ background: "var(--paper-deep)", borderRight: "1px solid var(--rule)" }}>
      <p className="eyebrow px-3 pb-2 pt-1" style={{ color: "var(--bottomline-green)" }}>Prime Bottomline Advisory</p>

      <div className="px-3 pb-3">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--ink-secondary)" }}>Company</p>
        {companies.length > 1 ? (
          <select
            className="input-field"
            style={{ minHeight: 34, padding: "6px 8px", fontSize: 13 }}
            value={companyId ?? ""}
            onChange={(e) => startTransition(async () => { await switchCompany(e.target.value); router.refresh(); close(); })}
          >
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : (
          <p className="text-[13.5px] font-bold" style={{ color: "var(--ink)" }}>{companies[0]?.name ?? "No company yet"}</p>
        )}
      </div>

      <NavItem page="home" who={who} pathname={pathname} onNavigate={close} />
      <NavItem page="dashboard" who={who} pathname={pathname} onNavigate={close} />
      <NavItem page="up-month" who={who} pathname={pathname} onNavigate={close} label="Uploads" href="/uploads/month" matchPrefix="/uploads" />
      <NavItem
        page="close" who={who} pathname={pathname} onNavigate={close}
        extra={closeWaiting > 0 ? (
          <span className="rounded-full px-1.5 text-[10.5px] font-bold" style={{ background: "var(--status-uploaded)", color: "#fff" }}>{closeWaiting}</span>
        ) : null}
      />
      <NavItem page="filings" who={who} pathname={pathname} onNavigate={close} />
      <NavItem page="files" who={who} pathname={pathname} onNavigate={close} />
      <NavItem page="dataroom" who={who} pathname={pathname} onNavigate={close} />
      {(canOpen(who, "companies") || canOpen(who, "people")) && (
        <>
          <div className="my-2" style={{ borderTop: "1px solid var(--rule)" }} />
          <p className="px-3 pb-0.5 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--ink-secondary)" }}>Admin</p>
        </>
      )}
      <NavItem page="companies" who={who} pathname={pathname} onNavigate={close} />
      <NavItem page="people" who={who} pathname={pathname} onNavigate={close} />
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
