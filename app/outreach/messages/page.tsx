import { loadOutreach } from "@/lib/outreachServer";
import Top from "../Top";
import Fail from "../Fail";
import Messages from "../Messages";

export default async function MessagesPage() {
  const data = await loadOutreach();
  if (!data.ok) return <><Top title="Messages & AI" /><Fail detail={data.detail} /></>;
  return <><Top title="Messages & AI" /><Messages settings={data.settings} leads={data.leads} /></>;
}
