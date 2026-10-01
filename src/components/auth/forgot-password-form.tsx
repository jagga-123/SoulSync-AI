"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthCard } from "@/components/auth/auth-card";
import { FormField } from "@/components/auth/form-field";
import { TurnstileWidget } from "@/components/auth/turnstile";
import { forgotPasswordFormSchema } from "@/lib/validators/auth";
import { fieldErrorsFromZod } from "@/lib/zod-errors";
import { forgotPassword } from "@/lib/api/auth";
import { ApiClientError } from "@/lib/api-client";
import { TURNSTILE_SITE_KEY } from "@/lib/env";

/**
 * Always shows the same success message, whatever the email — the API deliberately never reveals
 * whether an address has an account, so the form can't either (docs/redesign/10 §4, C1).
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | undefined>(undefined);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const result = forgotPasswordFormSchema.safeParse({ email });
    if (!result.success) {
      setFieldError(fieldErrorsFromZod(result.error).email);
      return;
    }
    setFieldError(undefined);
    setIsSubmitting(true);

    try {
      await forgotPassword(result.data.email, captchaToken);
      setSent(true);
    } catch (err) {
      // The verification challenge is the one failure worth naming specifically — it reveals
      // nothing about whether the address has an account. Everything else stays silent by design.
      const isCaptchaFailure = err instanceof ApiClientError && (err.details as { code?: string } | undefined)?.code === "CAPTCHA_FAILED";
      setFormError(isCaptchaFailure ? (err as ApiClientError).message : "Something went wrong. Please try again.");
      setCaptchaToken(undefined);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (sent) {
    return (
      <AuthCard
        title="Check your email"
        description="If that address has a SoulSync account, we've sent a link to reset your password. It works for 1 hour."
        footer={
          <Link href="/login" className="font-medium text-white hover:text-accent">
            Back to sign in
          </Link>
        }
      >
        <div className="flex justify-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-brand shadow-lg shadow-primary/25">
            <CheckCircle2 className="size-6 text-white" aria-hidden />
          </span>
        </div>
        <p className="mt-6 text-center text-sm text-white/60">
          Don&apos;t see it? Check spam, or{" "}
          <button
            type="button"
            onClick={() => setSent(false)}
            className="rounded-sm font-medium text-accent underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            try another address
          </button>
          .
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Forgot your password?"
      description="Enter your email and we'll send you a link to reset it."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-white hover:text-accent">
            Back to sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <FormField label="Email" htmlFor="email" error={fieldError}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoFocus
          />
        </FormField>

        <TurnstileWidget onVerify={setCaptchaToken} onExpire={() => setCaptchaToken(undefined)} />

        <Button
          type="submit"
          disabled={isSubmitting || (!!TURNSTILE_SITE_KEY && !captchaToken)}
          className="w-full gap-2 bg-gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-90"
        >
          {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {isSubmitting ? "Sending..." : "Send reset link"}
        </Button>
      </form>
    </AuthCard>
  );
}
