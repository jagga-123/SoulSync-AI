"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BellOff, CircleCheck, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AuthCard } from "@/components/auth/auth-card";
import { unsubscribe } from "@/lib/api/platform";
import { errorMessage } from "@/lib/gate";

const SCOPE_LABELS: Record<string, string> = {
  matches: "match alert emails",
  messages: "message alert emails",
  weeklyReport: "the weekly compatibility report",
  referrals: "referral update emails",
  all: "all optional emails",
};

/**
 * One-click unsubscribe from an email link. It asks for a click rather than
 * acting on page load, so link-scanning mail filters can't unsubscribe people.
 */
export function UnsubscribeView() {
  const token = useSearchParams().get("token");
  const [isWorking, setIsWorking] = useState(false);
  const [scope, setScope] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!token) return;
    setIsWorking(true);
    setError(null);
    try {
      setScope((await unsubscribe(token)).scope);
    } catch (err) {
      setError(errorMessage(err, "We couldn't process that link."));
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <AuthCard title={scope ? "You're unsubscribed" : "Unsubscribe from emails"}>
      <div className="flex flex-col items-center gap-5 text-center">
        {scope ? (
          <>
            <CircleCheck className="size-12 text-accent" />
            <p role="status" className="text-sm text-white/65">
              You won&apos;t receive {SCOPE_LABELS[scope] ?? "these emails"} any more. You can change this any time in Settings.
            </p>
          </>
        ) : !token ? (
          <Alert variant="destructive">
            <AlertDescription>This unsubscribe link is incomplete. Use the link at the bottom of the email you received.</AlertDescription>
          </Alert>
        ) : (
          <>
            <BellOff className="size-10 text-white/50" />
            <p className="text-sm text-white/65">Confirm to stop receiving these emails. Account emails, like receipts and security notices, will still be sent.</p>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button onClick={() => void confirm()} disabled={isWorking} className="gap-2 rounded-full bg-gradient-brand text-white hover:opacity-90">
              {isWorking && <Loader2 className="size-4 animate-spin" />}
              Unsubscribe
            </Button>
          </>
        )}
        <Link href="/settings" className="text-sm text-accent hover:underline">
          Manage all email preferences
        </Link>
      </div>
    </AuthCard>
  );
}
