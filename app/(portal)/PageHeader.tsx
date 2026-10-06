import { getSession } from "@/lib/auth";
import { WHO_LABEL } from "@/lib/access";
import { DEV_BYPASS_AUTH } from "@/lib/devBypass";
import SignOutButton from "./SignOutButton";

// Title on the left; who you are and which hat you are wearing on the right.
export default async function PageHeader({ title, accent, sub }: { title: string; accent?: string; sub?: string }) {
  const { user, who } = await getSession();
  return (
    <header className="flex items-center justify-between gap-4 border-b px-5 py-4 pl-14 md:px-8" style={{ borderColor: "var(--rule)" }}>
      <div className="min-w-0">
        <h1 className="truncate text-[21px] font-extrabold">
          {title} {accent && <span style={{ color: "var(--bottomline-green)" }}>· {accent}</span>}
        </h1>
        {sub && <p className="mt-0.5 text-[12px]" style={{ color: "var(--ink-secondary)" }}>{sub}</p>}
      </div>
      <div className="flex flex-shrink-0 items-center gap-3">
        <div className="text-right">
          <p className="truncate text-[13px] font-bold" style={{ color: "var(--ink)" }}>{user?.name}</p>
          <p className="mt-0.5 text-[11px]" style={{ color: "var(--ink-secondary)" }}>
            {who ? WHO_LABEL[who] : ""}{user?.firm_name && who === "external" ? ` · ${user.firm_name}` : ""}
          </p>
        </div>
        {!DEV_BYPASS_AUTH && <SignOutButton />}
      </div>
    </header>
  );
}
