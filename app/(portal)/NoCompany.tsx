import PageHeader from "./PageHeader";
import { PAGES, type PageKey } from "@/lib/access";

export default function NoCompany({ page, admin }: { page: PageKey; admin: boolean }) {
  return (
    <>
      <PageHeader title={PAGES[page].label} />
      <div className="mx-auto mt-16 max-w-[460px] px-5 text-center">
        <h2 className="text-[18px] font-extrabold">{admin ? "No company yet" : "You haven't been added to a company yet"}</h2>
        <p className="mt-2 text-[14px]" style={{ color: "var(--ink-secondary)" }}>
          {admin ? "Create one under Admin → Companies." : "Prime Bottomline gives you access to a company; once that is done it shows up here."}
        </p>
      </div>
    </>
  );
}
