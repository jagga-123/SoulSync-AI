import type { Metadata } from "next";
import { PricingView } from "@/components/platform/pricing-view";

export const metadata: Metadata = {
  title: "Pricing",
  alternates: { canonical: "/pricing" },
  description: "SoulSync plans: start free, upgrade for unlimited likes, advanced filters and the full AI matchmaking experience.",
};

export default function PricingPage() {
  return <PricingView />;
}
