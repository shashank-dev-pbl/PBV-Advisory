import "./proto.css";
import CompanyRow from "./CompanyRow";
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
              {rows.map((r) => <CompanyRow key={r.id} r={r} manage={manage} />)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
