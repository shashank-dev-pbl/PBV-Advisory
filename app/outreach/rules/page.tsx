import { loadOutreach } from "@/lib/outreachServer";
import Top from "../Top";
import Fail from "../Fail";
import Rules from "../Rules";

export default async function RulesPage() {
  const data = await loadOutreach();
  if (!data.ok) return <><Top title="Sequence & rules" /><Fail detail={data.detail} /></>;
  return <><Top title="Sequence & rules" /><Rules settings={data.settings} /></>;
}
