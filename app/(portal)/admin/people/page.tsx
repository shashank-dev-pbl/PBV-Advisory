import { pageGate } from "@/lib/gate";
import PageHeader from "../../PageHeader";
import Locked from "../../Locked";

export default async function Page() {
  const { session, locked } = await pageGate("people");
  if (locked) return <Locked page="people" who={session.who!} />;
  return (
    <>
      <PageHeader title="people" />
    </>
  );
}
