import type { Metadata } from "next";
import OnboardingFlow from "@/components/OnboardingFlow";

export const metadata: Metadata = {
  title: "Onboarding Test — NOD",
  description: "Working port of the New Onboarding flow from the NOD Figma file.",
};

export default function OnboardingTestPage() {
  return <OnboardingFlow />;
}
