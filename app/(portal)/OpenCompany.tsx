"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchCompany } from "./actions";

// Switches the acting company, then goes to the page — so a button on "My companies" lands in the right company.
export default function OpenCompany({ companyId, href, label, primary }: { companyId: string; href: string; label: string; primary?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(async () => { await switchCompany(companyId); router.push(href); router.refresh(); })}
      className="btn-small"
      style={primary
        ? { background: "var(--bottomline-green)", color: "var(--paper)", border: "1px solid var(--bottomline-green)" }
        : { background: "transparent", color: "var(--ink-secondary)", border: "1px solid var(--rule)" }}
    >
      {label}
    </button>
  );
}
