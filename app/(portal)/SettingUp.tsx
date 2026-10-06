import PageHeader from "./PageHeader";
import { PAGES, type PageKey } from "@/lib/access";

// A company admin has created but not yet taken live: nothing has been requested from anyone.
export default function SettingUp({ page, name }: { page: PageKey; name: string }) {
  return (
    <>
      <PageHeader title={name} accent={PAGES[page].label} />
      <div className="mx-auto mt-10 max-w-[560px] px-5">
        <div className="p-5 text-[14px]" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 10, color: "var(--ink-secondary)" }}>
          <b style={{ color: "var(--ink)" }}>{name} is being set up.</b>
          <br />
          Nothing has been requested yet. The checklist appears here once admin finishes adding the company&apos;s people and takes it live.
        </div>
      </div>
    </>
  );
}
