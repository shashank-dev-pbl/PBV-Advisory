import Link from "next/link";
import { Lock } from "lucide-react";
import { LANDING, PAGES, type PageKey, type Who } from "@/lib/access";
import PageHeader from "./PageHeader";

// The one refusal. Clicking a locked tab, typing its address, or following a stale link all end here.
export default function Locked({ page, who }: { page: PageKey; who: Who }) {
  const home = PAGES[LANDING[who]];
  return (
    <>
    <PageHeader title={PAGES[page].label} />
    <div className="mx-auto mt-16 max-w-[460px] px-5 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)" }}>
        <Lock size={20} strokeWidth={1.75} style={{ color: "var(--ink-secondary)" }} />
      </div>
      <h2 className="text-[18px] font-extrabold">You don&apos;t have access to this page</h2>
      <p className="mt-2 text-[14px]" style={{ color: "var(--ink-secondary)" }}>
        <b style={{ color: "var(--ink)" }}>{PAGES[page].label}</b> is not open to your account.
      </p>
      <p className="mt-1 text-[14px]" style={{ color: "var(--ink-secondary)" }}>Ask Prime Bottomline if you think you should have access.</p>
      <Link href={home.href} className="btn-small mt-5" style={{ background: "var(--bottomline-green)", color: "var(--paper)", border: "1px solid var(--bottomline-green)" }}>
        Back to {home.label}
      </Link>
    </div>
    </>
  );
}
