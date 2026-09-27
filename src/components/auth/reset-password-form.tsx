"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthCard } from "@/components/auth/auth-card";
import { FormField } from "@/components/auth/form-field";
import { resetPasswordFormSchema } from "@/lib/validators/auth";
import { fieldErrorsFromApi, fieldErrorsFromZod } from "@/lib/zod-errors";
import { resetPassword } from "@/lib/api/auth";
import { ApiClientError } from "@/lib/api-client";

export function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <AuthCard title="This link isn't valid" description="Reset links are one-time and expire after an hour. Request a new one to continue.">
        <Button asChild className="w-full gap-2 bg-gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-90">
          <Link href="/forgot-password">Send a new link</Link>
        </Button>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title="Password reset" description="You're signed out on every device — sign in again with your new password.">
        <div className="flex justify-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-brand shadow-lg shadow-primary/25">
            <CheckCircle2 className="size-6 text-white" aria-hidden />
          </span>
        </div>
        <Button asChild className="mt-6 w-full gap-2 bg-gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-90">
          <Link href="/login">Sign in</Link>
        </Button>
      </AuthCard>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const result = resetPasswordFormSchema.safeParse({ password });
    const mismatch = password !== confirm ? "Passwords don't match." : undefined;
    if (!result.success || mismatch) {
      setFieldErrors({ ...(result.success ? {} : fieldErrorsFromZod(result.error)), ...(mismatch ? { confirm: mismatch } : {}) });
      return;
    }
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      await resetPassword(token, result.data.password);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFormError(err.message);
        if (err.status === 422) setFieldErrors(fieldErrorsFromApi(err.details));
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard title="Choose a new password" description="At least 8 characters, with a letter and a number.">
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {formError && (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{formError}</span>
              {/invalid|expired/i.test(formError) && (
                <Button asChild size="sm" variant="outline" className="rounded-full border-white/20 bg-transparent text-white hover:bg-white/10">
                  <Link href="/forgot-password" onClick={() => router.refresh()}>
                    Send a new link
                  </Link>
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        <FormField label="New password" htmlFor="password" error={fieldErrors.password}>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoFocus
          />
        </FormField>

        <FormField label="Confirm new password" htmlFor="confirm" error={fieldErrors.confirm}>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
          />
        </FormField>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full gap-2 bg-gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-90"
        >
          {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {isSubmitting ? "Saving..." : "Reset password"}
        </Button>
      </form>
    </AuthCard>
  );
}
