"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Check, CheckCircle2, Copy, Gift, Loader2, Send, Users } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppPage, Section } from "@/components/platform/app-page";
import { getReferrals, sendInvites } from "@/lib/api/platform";
import { errorMessage, gateOf } from "@/lib/gate";
import { cn } from "@/lib/utils";
import type { ReferralSummary } from "@/types/platform";

export function ReferralsView() {
  return (
    <AppPage title="Invite friends" description="Bring people you trust. When they finish their AI interview, you earn rewards." width="narrow">
      {() => <Referrals />}
    </AppPage>
  );
}

function Referrals() {
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [emails, setEmails] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    getReferrals()
      .then(setSummary)
      .catch((err) => (gateOf(err)?.kind === "disabled" ? setDisabled(true) : setError(errorMessage(err, "Couldn't load your referral details."))));
  }, []);

  async function copy(text: string, what: "code" | "link") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setError("Couldn't copy automatically — select the text and copy it manually.");
    }
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    const list = [...new Set(emails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean))];
    if (list.length === 0) return;
    if (list.length > 5) {
      setError("You can invite up to 5 people at a time.");
      return;
    }
    setIsSending(true);
    setError(null);
    setSent(null);
    try {
      await sendInvites(list);
      setSent(`Invitation${list.length === 1 ? "" : "s"} on the way.`);
      setEmails("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSending(false);
    }
  }

  if (disabled) {
    return <div role="status" className="glass rounded-3xl p-8 text-center text-sm text-white/60">The referral program isn&apos;t available right now.</div>;
  }
  if (!summary) {
    return error ? (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    ) : (
      <div className="flex justify-center py-20 text-white/40">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  const next = summary.nextTier;

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Section>
        <p className="text-xs font-medium uppercase tracking-wider text-white/40">Your referral code</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="font-display text-3xl font-semibold tracking-[0.18em] text-white">{summary.code}</span>
          <Button variant="outline" size="sm" onClick={() => void copy(summary.code, "code")} className="gap-1.5 rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]">
            {copied === "code" ? <Check className="size-3.5 text-accent" /> : <Copy className="size-3.5" />}
            {copied === "code" ? "Copied" : "Copy code"}
          </Button>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Input readOnly value={summary.link} aria-label="Your invite link" onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
          <Button onClick={() => void copy(summary.link, "link")} className="shrink-0 gap-1.5 rounded-full bg-gradient-brand text-white hover:opacity-90">
            {copied === "link" ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied === "link" ? "Copied" : "Copy link"}
          </Button>
        </div>
      </Section>

      <div className="grid grid-cols-3 gap-4">
        <Stat label="Invited" value={summary.counts.invited} />
        <Stat label="Successful" value={summary.counts.successful} highlight />
        <Stat label="Pending" value={summary.counts.pending} />
      </div>

      <Section title="Rewards" description="A referral counts as successful once your friend finishes their AI interview.">
        {!summary.rewardsEnabled && (
          <p role="status" className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/60">
            Rewards are launching soon. Your successful referrals are already being counted, and everything you&apos;ve earned will be applied automatically.
          </p>
        )}
        <ul className="space-y-3">
          {summary.tiers.map((tier) => (
            <li key={tier.threshold} className={cn("flex items-center gap-3 rounded-2xl border p-3.5", tier.achieved ? "border-accent/30 bg-accent/[0.06]" : "border-white/8 bg-white/[0.02]")}>
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", tier.achieved ? "bg-accent/20 text-accent" : "bg-white/5 text-white/40")}>
                {tier.granted ? <CheckCircle2 className="size-5" /> : <Gift className="size-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">{tier.label}</p>
                <p className="text-xs text-white/45">
                  {tier.threshold} successful referral{tier.threshold === 1 ? "" : "s"}
                </p>
              </div>
              <span className="text-xs font-medium text-white/50">{tier.granted ? "Earned" : tier.achieved ? "Unlocked" : `${Math.max(0, tier.threshold - summary.counts.successful)} to go`}</span>
            </li>
          ))}
        </ul>
        {next && <p className="mt-4 text-sm text-white/55">{next.threshold - summary.counts.successful} more successful referral{next.threshold - summary.counts.successful === 1 ? "" : "s"} to unlock {next.label}.</p>}
      </Section>

      <Section title="Invite by email" description="We'll send a personal invitation with your link. Up to 5 at a time.">
        <form onSubmit={invite} className="space-y-3">
          <Input value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="friend@example.com, another@example.com" aria-label="Email addresses" />
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isSending || !emails.trim()} className="gap-2 rounded-full bg-gradient-brand text-white hover:opacity-90">
              {isSending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Send invitations
            </Button>
            {sent && <span role="status" className="text-sm text-accent">{sent}</span>}
          </div>
        </form>
      </Section>

      {summary.recent.length > 0 && (
        <Section title="Your friends">
          <ul className="divide-y divide-white/5">
            {summary.recent.map((r, i) => (
              <li key={i} className="flex items-center justify-between py-3 text-sm">
                <span className="flex items-center gap-2 text-white">
                  <Users className="size-4 text-white/40" /> {r.name}
                </span>
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs", r.status === "qualified" ? "bg-accent/10 text-accent" : "bg-white/10 text-white/55")}>
                  {r.status === "qualified" ? "Finished interview" : "Joined"}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="glass rounded-2xl p-4 text-center">
      <p className={cn("font-display text-3xl font-semibold", highlight ? "text-gradient-brand" : "text-white")}>{value}</p>
      <p className="mt-0.5 text-xs text-white/45">{label}</p>
    </div>
  );
}
