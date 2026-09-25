import type { Metadata } from "next";
import { ReferralsView } from "@/components/platform/referrals-view";

export const metadata: Metadata = {
  title: "Invite friends",
  description: "Invite friends to SoulSync and earn rewards.",
  robots: { index: false, follow: false },
};

export default function ReferralsPage() {
  return <ReferralsView />;
}
