import type { Metadata } from "next";
import { MatchesView } from "@/components/matches/matches-view";

export const metadata: Metadata = {
  title: "Matches",
  description: "Your matches on SoulSync AI.",
  robots: { index: false, follow: false },
};

export default function MatchesPage() {
  return <MatchesView />;
}
