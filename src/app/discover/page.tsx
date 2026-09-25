import type { Metadata } from "next";
import { DiscoverView } from "@/components/discover/discover-view";

export const metadata: Metadata = {
  title: "Discover",
  description: "Discover people on SoulSync.",
  robots: { index: false, follow: false },
};

export default function DiscoverPage() {
  return <DiscoverView />;
}
