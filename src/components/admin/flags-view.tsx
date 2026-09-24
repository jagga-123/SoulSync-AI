"use client";

import { useState } from "react";
import { Loader2, RotateCcw, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { AdminHeading, LoadingBlock } from "@/components/admin/admin-shell";
import { Chip } from "@/components/admin/admin-ui";
import { useApi } from "@/hooks/use-api";
import { adminFlags, adminResetFlag, adminSetFlag } from "@/lib/api/platform";
import { errorMessage } from "@/lib/gate";
import type { FeatureFlag } from "@/types/platform";

const CATEGORIES: Array<{ key: FeatureFlag["category"]; title: string; blurb: string }> = [
  { key: "core", title: "Core", blurb: "Platform-wide switches." },
  { key: "premium", title: "Premium perks", blurb: "Each perk also needs the member to be on a plan that includes it. All ship OFF." },
  { key: "growth", title: "Growth", blurb: "Referrals, rewards, the waitlist and profile views." },
  { key: "safety", title: "Safety", blurb: "Reporting and blocking. Leave these on." },
];

/** Flags whose activation changes what people pay, get, or can do — worth a second look. */
const CONFIRM_WHEN_ENABLING: Record<string, string> = {
  billing: "Members will be able to start paid subscriptions. Make sure your payment provider is configured and tested.",
  ai_deep_analysis: "This uses your AI provider (paid API usage) for every deep analysis a Premium Plus member generates.",
  like_limits: "Free members will be limited to 20 likes per day, immediately.",
  waitlist_mode: "New registrations will require an invite or a referral code. Existing members are unaffected.",
  referral_rewards: "Members will receive free Premium time for successful referrals — including anything already earned.",
  profile_boost: "Premium Plus members will be able to boost their profile, which affects everyone's recommendation order.",
};

export function FlagsView() {
  const flags = useApi(adminFlags);
  // `pending` is kept after the dialog closes so its text doesn't blank out during the fade-out.
  const [pending, setPending] = useState<{ flag: FeatureFlag; enabled: boolean } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function apply(flag: FeatureFlag, enabled: boolean) {
    setBusyKey(flag.key);
    setError(null);
    try {
      const { flags: updated } = await adminSetFlag(flag.key, enabled);
      flags.setData({ flags: updated });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyKey(null);
      setConfirmOpen(false);
    }
  }

  async function reset(flag: FeatureFlag) {
    setBusyKey(flag.key);
    setError(null);
    try {
      const { flags: updated } = await adminResetFlag(flag.key);
      flags.setData({ flags: updated });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyKey(null);
    }
  }

  function request(flag: FeatureFlag, enabled: boolean) {
    if (enabled && CONFIRM_WHEN_ENABLING[flag.key]) {
      setPending({ flag, enabled });
      setConfirmOpen(true);
    }
    else void apply(flag, enabled);
  }

  return (
    <div>
      <AdminHeading title="Feature flags" description="Turn features on or off instantly — no deploy needed. Every change is recorded in the audit log." />

      {(error || flags.error) && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error ?? flags.error}</AlertDescription>
        </Alert>
      )}

      {!flags.data ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-8">
          {CATEGORIES.map((cat) => {
            const items = flags.data!.flags.filter((f) => f.category === cat.key);
            if (items.length === 0) return null;
            return (
              <section key={cat.key} aria-labelledby={`cat-${cat.key}`}>
                <h2 id={`cat-${cat.key}`} className="font-display text-lg font-semibold text-white">
                  {cat.title}
                </h2>
                <p className="mb-3 text-sm text-white/60">{cat.blurb}</p>
                <ul className="glass divide-y divide-white/5 overflow-hidden rounded-2xl">
                  {items.map((flag) => (
                    <li key={flag.key} className="flex items-center gap-4 px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <label htmlFor={`flag-${flag.key}`} className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-medium text-white">
                          {flag.label}
                          <Chip tone={flag.source === "database" ? "brand" : "neutral"}>{flag.source === "database" ? "Admin override" : flag.source === "env" ? "From environment" : "Default"}</Chip>
                        </label>
                        <p className="mt-0.5 text-xs leading-relaxed text-white/60">{flag.description}</p>
                        <p className="mt-0.5 font-mono text-xs text-white/60">{flag.key} · default {flag.defaultEnabled ? "on" : "off"}</p>
                      </div>
                      {flag.source === "database" && (
                        <button type="button" onClick={() => void reset(flag)} disabled={busyKey === flag.key} aria-label={`Reset ${flag.label} to its default`} title="Reset to default" className="flex size-8 shrink-0 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white">
                          <RotateCcw className="size-4" />
                        </button>
                      )}
                      {busyKey === flag.key ? (
                        <Loader2 className="size-5 animate-spin text-white/60" />
                      ) : (
                        <Switch id={`flag-${flag.key}`} checked={flag.enabled} onCheckedChange={(v) => request(flag, v)} />
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-1 size-5 shrink-0 text-amber-300" />
            <div>
              <DialogTitle className="pr-0">Turn on “{pending?.flag.label}”?</DialogTitle>
              <DialogDescription>{pending ? CONFIRM_WHEN_ENABLING[pending.flag.key] : ""} It takes effect for everyone within seconds.</DialogDescription>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline" className="rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]">
                Cancel
              </Button>
            </DialogClose>
            <Button onClick={() => pending && void apply(pending.flag, true)} className="rounded-full bg-gradient-brand text-white hover:opacity-90">
              Turn on
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
