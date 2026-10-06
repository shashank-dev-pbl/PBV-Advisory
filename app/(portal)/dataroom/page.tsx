import { pageGate } from "@/lib/gate";
import PageHeader from "../PageHeader";
import Locked from "../Locked";
import NoCompany from "../NoCompany";
import SettingUp from "../SettingUp";

export default async function DataRoomPage() {
  const { session, locked } = await pageGate("dataroom");
  if (locked) return <Locked page="dataroom" who={session.who!} />;
  const company = session.company;
  if (!company) return <NoCompany page="dataroom" admin={session.who === "admin"} />;
  if (company.status === "setting_up") return <SettingUp page={"dataroom"} name={company.name} />;
  return (
    <>
      <PageHeader title={company.name} accent="Data room" sub="The company's legal history in one place" />
      <div className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8">
        <p className="text-[14px]" style={{ color: "var(--ink-secondary)" }}>
          The data room — standard documents and the company timeline — is the next piece of Build 4 and is not live yet.
        </p>
      </div>
    </>
  );
}
