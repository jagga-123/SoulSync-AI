import type { Metadata } from "next";
import { PremiumView } from "@/components/platform/premium-view";

export const metadata: Metadata = {
  title: "My perks",
  description: "Your SoulSync AI plan perks and tools.",
  robots: { index: false, follow: false },
};

export default function PremiumPage() {
  return <PremiumView />;
}
