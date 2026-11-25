import { loadOutreach } from "@/lib/outreachServer";
import Top from "../Top";
import Fail from "../Fail";
import Queue from "../Queue";

export default async function QueuePage() {
  const data = await loadOutreach();
  if (!data.ok) return <><Top title="Swetha's queue" /><Fail detail={data.detail} /></>;
  return <><Top title="Swetha's queue" /><Queue leads={data.leads} settings={data.settings} pending={data.pendingReplies} /></>;
}
