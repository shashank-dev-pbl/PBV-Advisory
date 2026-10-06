import { pageGate } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";
import { formatPeriodLabel } from "@/lib/period";
import DownloadLink from "@/app/founder/dashboard/DownloadLink";
import PageHeader from "../PageHeader";
import Locked from "../Locked";
import NoCompany from "../NoCompany";
import SettingUp from "../SettingUp";
import UploadPdf from "./UploadPdf";

export default async function FilesPage() {
  const { session, locked } = await pageGate("files");
  if (locked) return <Locked page="files" who={session.who!} />;
  const company = session.company;
  if (!company) return <NoCompany page="files" admin={session.who === "admin"} />;
  if (company.status === "setting_up") return <SettingUp page={"files"} name={company.name} />;

  const supabase = await createClient();
  const { data } = await supabase
    .from("period_figures")
    .select("id, period, published_at, pdf_storage_path, pdf_filename")
    .eq("company_id", company.id)
    .eq("state", "published")
    .order("period", { ascending: false });
  const rows = data ?? [];
  const canUpload = session.who === "pba" || session.who === "admin";

  return (
    <>
      <PageHeader title={company.name} accent="Files delivered" sub="What Prime Bottomline has delivered to the company" />
      <div className="mx-auto w-full max-w-[1280px] px-5 py-8 md:px-8">
        {rows.length === 0 ? (
          <p className="text-[14px]" style={{ color: "var(--ink-secondary)" }}>
            Nothing has been delivered yet. Each month&apos;s signed MIS appears here once PBA has published the month.
          </p>
        ) : (
          <table className="w-full" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--rule)" }}>
                {["Document", "For", "Delivered", ""].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--ink-secondary)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--rule)" }}>
                  <td className="px-3 py-3">
                    <p className="text-[13.5px] font-bold" style={{ color: "var(--ink)" }}>Monthly MIS</p>
                    <p className="text-[12px]" style={{ color: "var(--ink-secondary)" }}>{r.pdf_filename ?? "Signed MIS, PDF"}</p>
                  </td>
                  <td className="px-3 py-3 text-[13px]" style={{ color: "var(--ink)" }}>{formatPeriodLabel(r.period)}</td>
                  <td className="px-3 py-3 text-[13px]" style={{ color: "var(--ink)" }}>{r.published_at ? new Date(r.published_at).toLocaleDateString() : "—"}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      {r.pdf_storage_path ? <DownloadLink storagePath={r.pdf_storage_path} /> : <span className="text-[12px]" style={{ color: "var(--ink-secondary)" }}>Not yet available</span>}
                      {canUpload && <UploadPdf companyId={company.id} periodFiguresId={r.id} period={r.period} replace={!!r.pdf_storage_path} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
