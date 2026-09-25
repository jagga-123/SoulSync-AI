import type { Metadata } from "next";

import { HeroSection } from "@/components/sections/hero-section";
import { TrustBarSection } from "@/components/sections/trust-bar-section";
import { HowItWorksSection } from "@/components/sections/how-it-works-section";
import { AIMatchmakingSection } from "@/components/sections/ai-matchmaking-section";
import { FeaturesSection } from "@/components/sections/features-section";
import { OurAISection } from "@/components/sections/our-ai-section";
import { EarlyAccessSection } from "@/components/sections/early-access-section";
import { FaqSection } from "@/components/sections/faq-section";
import { CTASection } from "@/components/sections/cta-section";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <>
      <HeroSection />
      <TrustBarSection />
      <HowItWorksSection />
      <AIMatchmakingSection />
      <FeaturesSection />
      <OurAISection />
      <EarlyAccessSection />
      <FaqSection />
      <CTASection />
    </>
  );
}
