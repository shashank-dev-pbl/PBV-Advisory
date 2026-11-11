"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { switchCompany } from "./actions";
import type { CompanyOverview } from "@/lib/companies/overview";

// A row of the Companies table. Clicking anywhere on it switches to that company and opens its dashboard;
// the People link (admins only) is the one thing inside it that goes somewhere else.
export default function CompanyRow({ r, manage }: { r: CompanyOverview; manage?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const open = () => start(async () => { await switchCompany(r.id); router.push("/dashboard"); router.refresh(); });
  return (
    <tr
      className="rowlink" role="link" tabIndex={0} aria-label={`${r.name}, open dashboard`} aria-busy={pending}
      style={pending ? { opacity: 0.6 } : undefined}
      onClick={open}
      onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) open(); }}
    >
      <td><b>{r.name}</b>{r.status !== "live" && <span className="dm"> · setting up</span>}</td>
      <td>{r.plan}</td>
      <td>{r.booksBy} · {r.pba}</td>
      <td>{r.late ? <span className="lpill" style={{ color: "#b3261e", background: "#fbe9e7" }}>{r.late} month{r.late > 1 ? "s" : ""} late</span> : r.waiting ? <span className="lpill" style={{ color: "#26527f", background: "#e9eef5" }}>Waiting for PBA check</span> : "On track"}</td>
      <td>{r.legalToPrice || "—"}</td>
      <td style={{ whiteSpace: "nowrap" }}>
        {manage && <Link className="lnk" href={`/admin/people?c=${r.id}`} onClick={(e) => e.stopPropagation()}>People</Link>}
      </td>
    </tr>
  );
}
