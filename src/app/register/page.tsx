import { Suspense } from "react";
import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = {
  title: "Create your account",
  alternates: { canonical: "/register" },
  description: "Create your SoulSync account and start with a conversation, not a photo.",
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
