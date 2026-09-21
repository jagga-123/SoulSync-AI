import { Suspense } from "react";
import type { Metadata } from "next";
import { UnsubscribeView } from "@/components/platform/unsubscribe-view";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
};

export default function UnsubscribePage() {
  return (
    <Suspense fallback={null}>
      <UnsubscribeView />
    </Suspense>
  );
}
