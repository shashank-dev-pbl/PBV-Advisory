import "./proto.css";
import OpenCompany from "./OpenCompany";
import Link from "next/link";
import type { CompanyOverview } from "@/lib/companies/overview";

// The prototype's Companies page: one row per company, with where its monthly close stands.
export default function CompaniesTable({ rows, intro, manage }: { rows: CompanyOverview[]; intro: string; manage?: boolean }) {
  return (
    <div className="p5">
      <div className="content" style={{ padding: "18px 22px" }}>
        <div className="dhead"><div className="dm">{intro}</div></div>
        <div className="tw">
          <table className="dt ctab">
            <thead><tr><th>Company</th><th>Services</th><th>Books by · PBA</th><th>Monthly close</th><th>Legal to price</th><th /></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} className="dm">No company yet.</td></tr>}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.name}</b>{r.status !== "live" && <span className="dm"> · setting up</span>}</td>
                  <td>{r.plan}</td>
                  <td>{r.booksBy} · {r.pba}</td>
                  <td>{r.late ? <span className="lpill" style={{ color: "#b3261e", background: "#fbe9e7" }}>{r.late} month{r.late > 1 ? "s" : ""} late</span> : r.waiting ? <span className="lpill" style={{ color: "#26527f", background: "#e9eef5" }}>Waiting for PBA check</span> : "On track"}</td>
                  <td>{r.legalToPrice || "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <OpenCompany companyId={r.id} href="/dashboard" label="Open" />
                    {manage && <> <Link className="lnk" href={`/admin/companies?c=${r.id}`}>People</Link></>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
