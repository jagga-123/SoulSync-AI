import { Suspense } from "react";
import type { Metadata } from "next";
import { MockCheckoutView } from "@/components/platform/mock-checkout-view";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

export default function MockCheckoutPage() {
  return (
    <Suspense>
      <MockCheckoutView />
    </Suspense>
  );
}
