import type { Metadata } from "next";
import { PersonalityReportView } from "@/components/ai/personality-report-view";
import { DeepAnalysisSection } from "@/components/platform/deep-analysis-section";

export const metadata: Metadata = {
  title: "Personality Report",
  description: "Your AI-generated personality report on SoulSync.",
  robots: { index: false, follow: false },
};

export default function PersonalityReportPage() {
  return (
    <>
      <PersonalityReportView />
      {/* Phase 6: paid perk, shown only when the feature flag is on. */}
      <DeepAnalysisSection />
    </>
  );
}
