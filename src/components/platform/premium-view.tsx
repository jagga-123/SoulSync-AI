"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, Check, Crown, Filter, Heart, HeartHandshake, Loader2, Lock, Rocket, Timer, TrendingUp } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AppPage, Section } from "@/components/platform/app-page";
import { usePlatform } from "@/components/platform/platform-provider";
import { UpgradeNotice } from "@/components/platform/upgrade-notice";
import { activateBoost, getBoost, getReadReceipts } from "@/lib/api/platform";
import { errorMessage, gateOf, PLAN_NAMES, type Gate } from "@/lib/gate";
import { cn } from "@/lib/utils";
import type { BoostStatus, PerkKey, ReadReceiptInsights } from "@/types/platform";

const PERKS: Array<{ key: PerkKey; label: string; description: string; icon: typeof Heart }> = [
  { key: "unlimited_likes", label: "Unlimited likes", description: "Like as many people as you want.", icon: Heart },
  { key: "advanced_filters", label: "Advanced filters", description: "Filter Discover by age, gender and interests.", icon: Filter },
  { key: "priority_recommendations", label: "Priority recommendations", description: "See far more of your top AI matches.", icon: TrendingUp },
  { key: "profile_boost", label: "Profile boost", description: "Be shown first in others' AI recommendations.", icon: Rocket },
  { key: "ai_deep_analysis", label: "AI deep analysis", description: "An in-depth read on your ideal partner.", icon: HeartHandshake },
  { key: "read_receipts_insights", label: "Read receipts insights", description: "See when and how fast your messages are read.", icon: BarChart3 },
];

export function PremiumView() {
  return (
    <AppPage title="My perks" description="What your plan includes, and the tools you can use right now." width="wide">
      {() => <Premium />}
    </AppPage>
  );
}

function Premium() {
  const { features, refreshFeatures } = usePlatform();

  useEffect(() => {
    void refreshFeatures();
  }, [refreshFeatures]);

  if (!features) {
    return (
      <div className="flex justify-center py-20 text-white/60">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  const allowance = features.likeAllowance;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <Section className="lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-white/60">Your plan</p>
              <p className="mt-1 flex items-center gap-2 font-display text-2xl font-semibold text-white">
                {features.plan !== "free" && <Crown className="size-5 text-primary" />}
                {PLAN_NAMES[features.plan]}
              </p>
            </div>
            <Button asChild variant="outline" className="rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]">
              <Link href={features.plan === "free" ? "/pricing" : "/billing"}>{features.plan === "free" ? "Upgrade" : "Manage plan"}</Link>
            </Button>
          </div>

          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {PERKS.map(({ key, label, description, icon: Icon }) => {
              const perk = features.perks[key];
              const state = perk.available ? "on" : !perk.enabled ? "soon" : "locked";
              return (
                <li key={key} className={cn("flex items-start gap-3 rounded-2xl border p-3.5", state === "on" ? "border-accent/30 bg-accent/[0.05]" : "border-white/8 bg-white/[0.02]")}>
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", state === "on" ? "bg-accent/20 text-accent" : "bg-white/5 text-white/60")}>
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-white">
                      {label}
                      {state === "on" && <Check className="size-3.5 text-accent" />}
                      {state === "locked" && <Lock className="size-3 text-white/60" />}
                    </p>
                    <p className="mt-0.5 text-xs text-white/60">{state === "soon" ? "Coming soon" : state === "locked" ? `${description} · Upgrade to unlock` : description}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section title="Daily likes">
          {allowance.unlimited ? (
            <div className="flex h-full min-h-28 flex-col items-center justify-center gap-1 text-center">
              <span className="font-display text-5xl font-semibold text-gradient-brand" aria-hidden>
                ∞
              </span>
              <p className="text-sm text-white/60">{allowance.enforced ? "You have unlimited likes." : "Likes are unlimited for everyone right now."}</p>
            </div>
          ) : (
            <>
              <p className="font-display text-4xl font-semibold text-white">
                {allowance.remaining}
                <span className="text-lg text-white/60"> / {allowance.limit}</span>
              </p>
              <p className="mt-1 text-sm text-white/50">likes left today</p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-brand" style={{ width: `${Math.min(100, ((allowance.used ?? 0) / (allowance.limit ?? 1)) * 100)}%` }} />
              </div>
              <Button asChild size="sm" className="mt-5 rounded-full bg-gradient-brand text-white hover:opacity-90">
                <Link href="/pricing">Get unlimited likes</Link>
              </Button>
            </>
          )}
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <BoostCard />
        <Section title="AI deep analysis" description="An in-depth read on your ideal partner, communication and growth areas.">
          <Button asChild className="rounded-full bg-gradient-brand text-white hover:opacity-90">
            <Link href="/personality-report">Open my report</Link>
          </Button>
        </Section>
      </div>

      <ReadReceipts />
    </div>
  );
}

function BoostCard() {
  const [boost, setBoost] = useState<BoostStatus | null>(null);
  const [gate, setGate] = useState<Gate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    getBoost()
      .then((r) => setBoost(r.boost))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  async function activate() {
    setIsBusy(true);
    setError(null);
    setGate(null);
    try {
      setBoost((await activateBoost()).boost);
    } catch (err) {
      const g = gateOf(err);
      if (g) setGate(g);
      else setError(errorMessage(err));
    } finally {
      setIsBusy(false);
    }
  }

  const minutesLeft = boost?.endsAt ? Math.max(0, Math.round((Date.parse(boost.endsAt) - Date.now()) / 60000)) : 0;

  return (
    <Section title="Profile boost" description="Rank first in other people's AI recommendations for an hour.">
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {gate && <UpgradeNotice gate={gate} className="mb-4" />}
      {!boost ? (
        <Loader2 className="size-5 animate-spin text-white/60" />
      ) : !boost.featureEnabled ? (
        <p className="text-sm text-white/50">Profile boost is coming soon.</p>
      ) : !boost.included ? (
        <UpgradeNotice gate={{ kind: "upgrade", requiredPlan: "premium_plus", message: "Profile boost is part of Premium Plus." }} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/55">Boosts this month</span>
            <span className="font-medium text-white">
              {boost.usedThisMonth} / {boost.quota} used
            </span>
          </div>
          {boost.active ? (
            <p role="status" className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm text-accent">
              <Timer className="size-4" /> Your profile is boosted — {minutesLeft} min left.
            </p>
          ) : (
            <Button onClick={() => void activate()} disabled={isBusy || boost.remaining === 0} className="gap-2 rounded-full bg-gradient-brand text-white hover:opacity-90">
              {isBusy ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
              {boost.remaining === 0 ? "No boosts left this month" : `Boost my profile (${boost.durationMinutes} min)`}
            </Button>
          )}
        </div>
      )}
    </Section>
  );
}

function ReadReceipts() {
  const [data, setData] = useState<ReadReceiptInsights | null>(null);
  const [gate, setGate] = useState<Gate | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getReadReceipts()
      .then(setData)
      .catch((err) => {
        const g = gateOf(err);
        if (g) setGate(g);
        else setError(errorMessage(err));
      });
  }, []);

  const fmt = (seconds: number | null) => (seconds === null ? "—" : seconds < 90 ? `${seconds}s` : seconds < 5400 ? `${Math.round(seconds / 60)}m` : `${(seconds / 3600).toFixed(1)}h`);

  return (
    <Section title="Read receipts insights" description="How often — and how fast — your messages get read.">
      {gate ? (
        <UpgradeNotice gate={gate} />
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !data ? (
        <Loader2 className="size-5 animate-spin text-white/60" />
      ) : data.sampleSize === 0 ? (
        <p className="text-sm text-white/50">Send a few messages and your insights will appear here.</p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Metric label="Messages sent" value={String(data.totals.sent)} />
            <Metric label="Read rate" value={data.totals.readRate === null ? "—" : `${data.totals.readRate}%`} />
            <Metric label="Median time to read" value={fmt(data.totals.medianReadSeconds)} />
            <Metric label="Unread" value={String(data.totals.unread)} />
          </div>
          {data.partners.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-white/60">
                  <tr>
                    <th className="pb-2 font-medium">Conversation</th>
                    <th className="pb-2 text-right font-medium">Sent</th>
                    <th className="pb-2 text-right font-medium">Read</th>
                    <th className="pb-2 text-right font-medium">Typical read time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.partners.map((p) => (
                    <tr key={p.userId}>
                      <td className="py-2.5 text-white">{p.name}</td>
                      <td className="py-2.5 text-right tabular-nums text-white/60">{p.sent}</td>
                      <td className="py-2.5 text-right tabular-nums text-white/60">{p.readRate}%</td>
                      <td className="py-2.5 text-right tabular-nums text-white/60">{fmt(p.medianReadSeconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
      <p className="font-display text-2xl font-semibold text-white">{value}</p>
      <p className="mt-0.5 text-xs text-white/60">{label}</p>
    </div>
  );
}
