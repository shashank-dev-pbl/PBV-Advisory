import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LANDING, PAGES } from "@/lib/access";

// Where each person lands after sign-in: founder → Dashboard · external practitioner → Monthly close ·
// PBA practitioner → My companies · admin → Companies.
export default async function Home() {
  const { user, who } = await getSession();
  if (!user || !who) redirect("/login");
  redirect(PAGES[LANDING[who]].href);
}
