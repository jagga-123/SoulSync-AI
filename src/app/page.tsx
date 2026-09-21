import { HeroSection } from "@/components/sections/hero-section";
import { TrustBarSection } from "@/components/sections/trust-bar-section";
import { AIMatchmakingSection } from "@/components/sections/ai-matchmaking-section";
import { MatchingDemoSection } from "@/components/sections/matching-demo-section";
import { HowItWorksSection } from "@/components/sections/how-it-works-section";
import { FeaturesSection } from "@/components/sections/features-section";
import { TestimonialsSection } from "@/components/sections/testimonials-section";
import { CTASection } from "@/components/sections/cta-section";

export default function Home() {
  return (
    <>
      <HeroSection />
      <TrustBarSection />
      <AIMatchmakingSection />
      <MatchingDemoSection />
      <HowItWorksSection />
      <FeaturesSection />
      <TestimonialsSection />
      <CTASection />
    </>
  );
}
