import { pageGate } from "@/lib/gate";
import { DEV_BYPASS_AUTH } from "@/lib/devBypass";
import { listPeople, listCompanies, listAccessLog } from "../actions";
import PageHeader from "../../PageHeader";
import Locked from "../../Locked";
import PeopleAdmin from "./PeopleAdmin";
import AdminError from "../AdminError";

export default async function PeoplePage() {
  const { session, locked } = await pageGate("people");
  if (locked) return <Locked page="people" who={session.who!} />;

  let data;
  try {
    data = await Promise.all([listPeople(), listCompanies(), listAccessLog()]);
  } catch (e) {
    return (
      <>
        <PageHeader title="People & Access" sub="Who can sign in, and to what" />
        <AdminError title="This page could not load" message={e instanceof Error ? e.message : String(e)} />
      </>
    );
  }
  const [people, companies, log] = data;
  return (
    <>
      <PageHeader title="People & Access" sub="Who can sign in, and to what" />
      <PeopleAdmin people={people} companies={companies.map((c) => ({ id: c.id, name: c.name }))} log={log} adminTypeAllowed={!DEV_BYPASS_AUTH} />
    </>
  );
}
