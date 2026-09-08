import { redirect } from "next/navigation";
import { getCurrentAppUser, needsOnboarding } from "@/lib/auth";
import OnboardingForm from "./OnboardingForm";

export default async function OnboardingPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (!needsOnboarding(appUser)) redirect("/");

  return <OnboardingForm role={appUser.role} />;
}
