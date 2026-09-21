"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FlaskConical, Loader2, ShieldCheck } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AppPage } from "@/components/platform/app-page";
import { completeMockCheckout } from "@/lib/api/platform";
import { errorMessage, formatMoney, PLAN_NAMES } from "@/lib/gate";
import type { PlanId } from "@/types/platform";

const PRICES: Record<string, Record<string, number>> = {
  premium: { monthly: 999, yearly: 9900 },
  premium_plus: { monthly: 1999, yearly: 19900 },
};

/** Reads the (untrusted, display-only) plan out of the signed session token. */
function describeSession(session: string): { plan: PlanId; interval: string } | null {
  try {
    const payload = JSON.parse(atob(session.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as { plan?: PlanId; interval?: string };
    return payload.plan && payload.interval ? { plan: payload.plan, interval: payload.interval } : null;
  } catch {
    return null;
  }
}

/**
 * Stand-in for Stripe/Razorpay's hosted checkout while PAYMENT_PROVIDER=mock.
 * No card is taken; "Pay" tells the sandbox provider the payment succeeded.
 * The API refuses this in production, so it can't hand out free plans there.
 */
export function MockCheckoutView() {
  return (
    <AppPage title="Checkout" width="narrow">
      {() => <MockCheckout />}
    </AppPage>
  );
}

function MockCheckout() {
  const router = useRouter();
  const session = useSearchParams().get("session") ?? "";
  const details = describeSession(session);
  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setIsPaying(true);
    setError(null);
    try {
      await completeMockCheckout(session);
      router.push("/billing?checkout=success");
    } catch (err) {
      setError(errorMessage(err));
      setIsPaying(false);
    }
  }

  if (!details) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          This checkout link is invalid or has expired. <Link href="/pricing" className="underline">Back to pricing</Link>
        </AlertDescription>
      </Alert>
    );
  }

  const amount = PRICES[details.plan]?.[details.interval] ?? 0;

  return (
    <div className="glass-strong space-y-6 rounded-3xl p-7">
      <div className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">
        <FlaskConical className="size-4 shrink-0" />
        Sandbox checkout — no real payment is taken.
      </div>

      <div>
        <p className="text-xs uppercase tracking-wider text-white/40">You&apos;re subscribing to</p>
        <p className="mt-1 font-display text-2xl font-semibold text-white">{PLAN_NAMES[details.plan]}</p>
        <p className="mt-1 text-white/60">
          {formatMoney(amount, "usd")} billed {details.interval}
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button onClick={() => void pay()} disabled={isPaying} className="flex-1 gap-2 rounded-full bg-gradient-brand text-white hover:opacity-90">
          {isPaying ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          {isPaying ? "Processing…" : `Pay ${formatMoney(amount, "usd")} (sandbox)`}
        </Button>
        <Button asChild variant="outline" className="rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]">
          <Link href="/pricing?checkout=cancelled">Cancel</Link>
        </Button>
      </div>
    </div>
  );
}
