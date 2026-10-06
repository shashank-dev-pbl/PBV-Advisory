import { pageGate } from "@/lib/gate";
import { DEV_BYPASS_AUTH } from "@/lib/devBypass";
import { listPeople, listCompanies, listAccessLog } from "../actions";
import PageHeader from "../../PageHeader";
import Locked from "../../Locked";
import PeopleAdmin from "./PeopleAdmin";

export default async function PeoplePage() {
  const { session, locked } = await pageGate("people");
  if (locked) return <Locked page="people" who={session.who!} />;

  const [people, companies, log] = await Promise.all([listPeople(), listCompanies(), listAccessLog()]);
  return (
    <>
      <PageHeader title="People & access" sub="Who can sign in, and to what" />
      <PeopleAdmin people={people} companies={companies.map((c) => ({ id: c.id, name: c.name }))} log={log} adminTypeAllowed={!DEV_BYPASS_AUTH} />
    </>
  );
}
