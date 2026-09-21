"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Crown, Loader2, Minus, Sparkles } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { usePlatform } from "@/components/platform/platform-provider";
import { getBillingOverview, getPlans, startCheckout, upgradePlan } from "@/lib/api/platform";
import { errorMessage, formatMoney, PLAN_NAMES } from "@/lib/gate";
import { cn } from "@/lib/utils";
import type { BillingInterval, BillingOverview, PaidPlanId, PlanCatalog, PlanId, SubscriptionView } from "@/types/platform";

const RANK: Record<PlanId, number> = { free: 0, premium: 1, premium_plus: 2 };

export function PricingView() {
  const { isAuthed, refreshFeatures } = usePlatform();
  const [catalog, setCatalog] = useState<PlanCatalog | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionView | null>(null);
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (isAuthed ? getBillingOverview() : getPlans())
      .then((data) => {
        if (!active) return;
        setCatalog(data);
        if ("subscription" in data) setSubscription((data as BillingOverview).subscription);
      })
      .catch((err) => active && setError(errorMessage(err, "Couldn't load plans.")));
    return () => {
      active = false;
    };
  }, [isAuthed]);

  const currentPlan = subscription?.plan ?? "free";
  const hasPaidSubscription = subscription?.source === "paid" && subscription.status !== "expired";

  async function choose(plan: PaidPlanId) {
    setError(null);
    setNotice(null);
    setBusy(plan);
    try {
      if (hasPaidSubscription && RANK[plan] > RANK[currentPlan]) {
        const { subscription: updated } = await upgradePlan(plan);
        setSubscription(updated);
        await refreshFeatures();
        setNotice(`You're now on ${PLAN_NAMES[plan]}.`);
      } else {
        const { url } = await startCheckout(plan, interval);
        window.location.href = url;
        return;
      }
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(null);
  }

  if (!catalog && !error) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-white/40" />
      </div>
    );
  }

  const currency = catalog?.currency ?? "usd";
  const billingOpen = catalog?.billingEnabled ?? false;

  return (
    <div className="mx-auto max-w-6xl px-4 py-28 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/70">
          <Sparkles className="size-3.5 text-accent" /> Plans
        </span>
        <h1 className="mt-5 font-display text-4xl font-semibold text-white sm:text-5xl">
          Find your person, <span className="text-gradient-brand">faster</span>
        </h1>
        <p className="mt-4 text-white/60">Start free. Upgrade for unlimited likes, sharper discovery and the full AI matchmaking experience.</p>

        <div role="group" aria-label="Billing interval" className="mt-8 inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
          {(["monthly", "yearly"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={interval === value}
              onClick={() => setInterval(value)}
              className={cn("rounded-full px-5 py-2 text-sm font-medium capitalize transition-colors", interval === value ? "bg-gradient-brand text-white" : "text-white/60 hover:text-white")}
            >
              {value}
              {value === "yearly" && <span className="ml-1.5 text-xs opacity-90">save ~17%</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-3xl space-y-3">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {notice && (
          <Alert>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        {catalog && !billingOpen && (
          <div role="status" className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center text-sm text-white/60">
            Paid plans open very soon. Everything on Free works today — we&apos;ll let you know the moment Premium is live.
          </div>
        )}
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        {catalog?.plans.map((plan) => {
          const featured = plan.id === "premium_plus";
          const isCurrent = plan.id === currentPlan;
          const price = interval === "monthly" ? plan.prices.monthly : Math.round(plan.prices.yearly / 12);
          const paid = plan.id !== "free";
          const isLower = RANK[plan.id] < RANK[currentPlan];

          return (
            <div key={plan.id} className={cn("relative flex flex-col rounded-3xl p-7", featured ? "glass-strong ring-1 ring-primary/40" : "glass")}>
              {featured && (
                <span className="absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-gradient-brand px-3 py-1 text-xs font-semibold text-white">
                  <Crown className="size-3" /> Full AI experience
                </span>
              )}
              <h2 className="font-display text-xl font-semibold text-white">{plan.name}</h2>
              <p className="mt-1 min-h-10 text-sm text-white/55">{plan.tagline}</p>

              <p className="mt-5 flex items-baseline gap-1">
                <span className="font-display text-4xl font-semibold text-white">{paid ? formatMoney(price, currency) : formatMoney(0, currency)}</span>
                <span className="text-sm text-white/45">{paid ? "/ month" : "forever"}</span>
              </p>
              <p className="mt-1 h-5 text-xs text-white/40">
                {paid && interval === "yearly" ? `Billed ${formatMoney(plan.prices.yearly, currency)} per year` : ""}
              </p>

              <ul className="mt-6 flex-1 space-y-3">
                <Feature>
                  {plan.limits.dailyLikes === null ? "Unlimited likes" : `${plan.limits.dailyLikes} likes per day`}
                </Feature>
                <Feature>Top {plan.limits.recommendations} AI recommendations</Feature>
                {plan.perks.filter((perk) => perk.key !== "unlimited_likes" && perk.key !== "priority_recommendations").map((perk) => (
                  <Feature key={perk.key} soon={!perk.live}>
                    {perk.label}
                    {perk.key === "profile_boost" && plan.limits.monthlyBoosts > 0 ? ` (${plan.limits.monthlyBoosts}/month)` : ""}
                  </Feature>
                ))}
                {plan.id === "free" && (
                  <>
                    <Feature muted>Advanced filters</Feature>
                    <Feature muted>AI deep analysis</Feature>
                  </>
                )}
              </ul>

              <div className="mt-7">
                {plan.id === "free" ? (
                  <Button asChild variant="outline" className="w-full rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]">
                    <Link href={isAuthed ? "/dashboard" : "/register"}>{isCurrent ? "Your current plan" : isAuthed ? "Go to dashboard" : "Get started free"}</Link>
                  </Button>
                ) : isCurrent ? (
                  <Button disabled className="w-full rounded-full bg-white/10 text-white/70">
                    Your current plan
                  </Button>
                ) : !isAuthed ? (
                  <Button asChild className="w-full rounded-full bg-gradient-brand text-white hover:opacity-90">
                    <Link href="/register">Sign up to choose {plan.name}</Link>
                  </Button>
                ) : (
                  <Button
                    onClick={() => void choose(plan.id as PaidPlanId)}
                    disabled={!billingOpen || busy !== null || isLower}
                    className="w-full gap-2 rounded-full bg-gradient-brand text-white hover:opacity-90 disabled:opacity-40"
                  >
                    {busy === plan.id && <Loader2 className="size-4 animate-spin" />}
                    {!billingOpen ? "Coming soon" : isLower ? "Included in your plan" : hasPaidSubscription ? `Upgrade to ${plan.name}` : `Choose ${plan.name}`}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mx-auto mt-10 max-w-xl text-center text-xs text-white/35">
        Cancel any time from Billing — you keep your plan until the end of the period you paid for. Prices in {currency.toUpperCase()}.
      </p>
    </div>
  );
}

function Feature({ children, muted, soon }: { children: React.ReactNode; muted?: boolean; soon?: boolean }) {
  return (
    <li className={cn("flex items-start gap-2.5 text-sm", muted ? "text-white/30" : "text-white/75")}>
      {muted ? <Minus className="mt-0.5 size-4 shrink-0" /> : <Check className="mt-0.5 size-4 shrink-0 text-accent" />}
      <span>
        {children}
        {soon && <span className="ml-2 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/50">soon</span>}
      </span>
    </li>
  );
}
