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
import { loginFormSchema } from "@/lib/validators/auth";
import { fieldErrorsFromApi, fieldErrorsFromZod } from "@/lib/zod-errors";
import { loginUser } from "@/lib/api/auth";
import { getMyProfile } from "@/lib/api/profile";
import { setToken } from "@/lib/auth-storage";
import { ApiClientError } from "@/lib/api-client";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justRegistered = searchParams.get("registered") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const result = loginFormSchema.safeParse({ email, password });
    if (!result.success) {
      setFieldErrors(fieldErrorsFromZod(result.error));
      return;
    }
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const { token } = await loginUser(result.data);
      setToken(token);

      // New accounts won't have a profile yet — send them to onboarding
      // instead of an empty dashboard.
      try {
        await getMyProfile();
        router.push("/dashboard");
      } catch {
        router.push("/onboarding");
      }
    } catch (err) {
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
      title="Welcome back"
      description="Log in to continue your SoulSync journey."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-medium text-white hover:text-accent">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {justRegistered && !formError && (
          <Alert className="border-accent/30 bg-accent/10">
            <CheckCircle2 className="size-4 text-accent" />
            <AlertDescription className="text-white/80">
              Account created. Log in to continue.
            </AlertDescription>
          </Alert>
        )}

        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

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

        <FormField label="Password" htmlFor="password" error={fieldErrors.password}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </FormField>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full gap-2 bg-gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-90"
        >
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          {isSubmitting ? "Signing in..." : "Log in"}
        </Button>
      </form>
    </AuthCard>
  );
}
