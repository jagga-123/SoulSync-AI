"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CircleCheck, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthCard } from "@/components/auth/auth-card";
import { FormField } from "@/components/auth/form-field";
import { getPublicFeatures, joinWaitlist } from "@/lib/api/platform";
import { errorMessage } from "@/lib/gate";

export function WaitlistView() {
  const referralCode = useSearchParams().get("ref") ?? undefined;
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ position: number; alreadyOnList: boolean } | null>(null);
  const [inviteOnly, setInviteOnly] = useState<boolean | null>(null);

  useEffect(() => {
    getPublicFeatures()
      .then((f) => setInviteOnly(f.waitlistMode))
      .catch(() => setInviteOnly(null));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      setResult(await joinWaitlist(email.trim(), referralCode));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (result) {
    return (
      <AuthCard title="You're on the list">
        <div role="status" className="flex flex-col items-center gap-4 text-center">
          <CircleCheck className="size-12 text-accent" />
          <p className="font-display text-4xl font-semibold text-gradient-brand">#{result.position}</p>
          <p className="text-sm text-white/65">
            {result.alreadyOnList ? "You're already on the waitlist." : "Thanks for your interest."} We&apos;ll email you the moment your invite is ready.
          </p>
          <p className="text-xs text-white/60">Know someone who&apos;s already a member? Ask for their invite link to skip the line.</p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Join the waitlist"
      description={inviteOnly === false ? "SoulSync AI is open right now — you can create an account straight away." : "We're letting people in gradually so every new member gets a great experience."}
      footer={
        <>
          Already invited?{" "}
          <Link href="/register" className="font-medium text-white hover:text-accent">
            Create your account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <FormField label="Email" htmlFor="waitlist-email">
          <Input id="waitlist-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
        </FormField>
        <Button type="submit" disabled={isSubmitting || !email.trim()} className="w-full gap-2 bg-gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-90">
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          Save my spot
        </Button>
      </form>
    </AuthCard>
  );
}
