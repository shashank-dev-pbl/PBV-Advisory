import { redirect } from "next/navigation";
import { getSession, needsOnboarding } from "@/lib/auth";
import OnboardingForm from "./OnboardingForm";

export default async function OnboardingPage() {
  const { user } = await getSession();
  if (!user) redirect("/login");
  if (!needsOnboarding(user)) redirect("/");

  return <OnboardingForm role={user.role} />;
}
