import { Suspense } from "react";
import type { Metadata } from "next";
import { WaitlistView } from "@/components/platform/waitlist-view";

export const metadata: Metadata = {
  title: "Join the waitlist",
  alternates: { canonical: "/waitlist" },
  description: "Get early access to SoulSync, the conversation-first dating app.",
};

export default function WaitlistPage() {
  return (
    <Suspense fallback={null}>
      <WaitlistView />
    </Suspense>
  );
}
