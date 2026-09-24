"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthCard } from "@/components/auth/auth-card";
import { FormField } from "@/components/auth/form-field";
import { registerFormSchema } from "@/lib/validators/auth";
import { fieldErrorsFromApi, fieldErrorsFromZod } from "@/lib/zod-errors";
import { registerUser } from "@/lib/api/auth";
import { ApiClientError } from "@/lib/api-client";
import { gateOf } from "@/lib/gate";

const registerWithConfirmSchema = registerFormSchema
  .extend({
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export function RegisterForm() {
  const router = useRouter();

  // Phase 6: invite links look like /register?ref=CODE (a friend) or
  // /register?invite=CODE&email=you@x.com (a waitlist invite).
  const params = useSearchParams();
  const referralCode = params.get("ref") ?? undefined;
  const inviteCode = params.get("invite") ?? undefined;
  const [waitlistRequired, setWaitlistRequired] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const result = registerWithConfirmSchema.safeParse({
      fullName,
      email,
      password,
      confirmPassword,
    });

    if (!result.success) {
      setFieldErrors(fieldErrorsFromZod(result.error));
      return;
    }
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      await registerUser({
        fullName: result.data.fullName,
        email: result.data.email,
        password: result.data.password,
        referralCode,
        inviteCode,
      });
      router.push("/login?registered=1");
    } catch (err) {
      if (gateOf(err)?.kind === "waitlist") setWaitlistRequired(true);
      if (err instanceof ApiClientError) {
        setFormError(err.message);
        if (err.status === 422) setFieldErrors(fieldErrorsFromApi(err.details));
      } else {
        setFormError("Something went wrong. Please try again.");
      }
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Create your account"
      description="Start with a conversation, not a photo."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-white hover:text-accent">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {referralCode && !formError && (
          <p role="status" className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-center text-sm text-accent">
            A friend invited you — welcome!
          </p>
        )}
        {formError && (
          <Alert variant="destructive">
            <AlertDescription>
              {formError}
              {waitlistRequired && (
                <>
                  {" "}
                  <Link href="/waitlist" className="font-medium underline">
                    Join the waitlist
                  </Link>
                </>
              )}
            </AlertDescription>
          </Alert>
        )}

        <FormField label="Full name" htmlFor="fullName" error={fieldErrors.fullName}>
          <Input
            id="fullName"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Doe"
          />
        </FormField>

        <FormField label="Email" htmlFor="email" error={fieldErrors.email}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </FormField>

        <FormField
          label="Password"
          htmlFor="password"
          error={fieldErrors.password}
          hint={!fieldErrors.password ? "At least 8 characters, with a letter and a number." : undefined}
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </FormField>

        <FormField
          label="Confirm password"
          htmlFor="confirmPassword"
          error={fieldErrors.confirmPassword}
        >
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
          />
        </FormField>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full gap-2 bg-gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-90"
        >
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          {isSubmitting ? "Creating account..." : "Create account"}
        </Button>
        <p className="text-center text-xs leading-relaxed text-white/60">
          SoulSync is for adults. By creating an account you confirm you&apos;re 18 or older.
        </p>
      </form>
    </AuthCard>
  );
}
