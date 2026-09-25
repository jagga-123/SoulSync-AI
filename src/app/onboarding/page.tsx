import type { Metadata } from "next";
import { OnboardingForm } from "@/components/auth/onboarding-form";

export const metadata: Metadata = {
  title: "Complete your profile",
  description: "Tell SoulSync a bit about yourself.",
  robots: { index: false, follow: false },
};

export default function OnboardingPage() {
  return <OnboardingForm />;
}
