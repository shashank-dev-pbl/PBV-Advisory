import { pageGate } from "@/lib/gate";
import PageHeader from "../PageHeader";
import Locked from "../Locked";
import NoCompany from "../NoCompany";

// Legal arrives in a later release (spec 09). The page exists now so the menu matches the prototype and the lock for external practitioners is real.
export default async function LegalPage() {
  const { session, locked } = await pageGate("legal");
  if (locked) return <Locked page="legal" who={session.who!} />;
  if (!session.company) return <NoCompany page="legal" admin={session.who === "admin"} />;
  return (
    <>
      <PageHeader title={session.company.name} accent="Legal" />
      <div className="mx-auto w-full max-w-[880px] px-5 py-10 md:px-8">
        <div className="p-8 text-center" style={{ background: "var(--paper-deep)", border: "1px dashed var(--rule)", borderRadius: 12 }}>
          <p className="text-[15px] font-bold" style={{ color: "var(--ink)" }}>Legal requests are coming soon.</p>
          <p className="mt-2 text-[13.5px]" style={{ color: "var(--ink-secondary)" }}>
            Ask Prime Bottomline to draft or review an NDA, offer letter, client contract or board resolution, pay online, and receive it here.
          </p>
        </div>
      </div>
    </>
  );
}
