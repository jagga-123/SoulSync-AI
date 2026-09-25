import type { Metadata } from "next";
import { LikesView } from "@/components/likes/likes-view";

export const metadata: Metadata = {
  title: "Likes",
  description: "See who liked you and who you've liked on SoulSync.",
  robots: { index: false, follow: false },
};

export default function LikesPage() {
  return <LikesView />;
}
