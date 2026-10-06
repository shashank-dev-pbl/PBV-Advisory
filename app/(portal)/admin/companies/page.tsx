import { pageGate } from "@/lib/gate";
import PageHeader from "../../PageHeader";
import Locked from "../../Locked";

export default async function Page() {
  const { session, locked } = await pageGate("companies");
  if (locked) return <Locked page="companies" who={session.who!} />;
  return (
    <>
      <PageHeader title="companies" />
    </>
  );
}
