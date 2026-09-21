import { Suspense } from "react";
import type { Metadata } from "next";
import { BillingView } from "@/components/platform/billing-view";

export const metadata: Metadata = {
  title: "Plan & billing",
  description: "Manage your SoulSync AI subscription.",
  robots: { index: false, follow: false },
};

export default function BillingPage() {
  return (
    <Suspense>
      <BillingView />
    </Suspense>
  );
}
