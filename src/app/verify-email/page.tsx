import { Suspense } from "react";
import type { Metadata } from "next";
import { VerifyEmailView } from "@/components/platform/verify-email-view";

export const metadata: Metadata = {
  title: "Verify your email",
  robots: { index: false, follow: false },
};

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailView />
    </Suspense>
  );
}
