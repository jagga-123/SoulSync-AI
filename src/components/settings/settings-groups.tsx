"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, Check, ExternalLink, Loader2, LogOut, MailWarning, UserX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Section } from "@/components/platform/app-page";
import { usePlatform } from "@/components/platform/platform-provider";
import { ProfileMedia } from "@/components/shared/profile-media";
import { getBillingOverview } from "@/lib/api/platform";
import { SOURCE_CODE_URL } from "@/lib/data";
import { errorMessage } from "@/lib/gate";
import { getInitials } from "@/lib/format";
import type { AuthUser } from "@/types/api";
import type { BillingOverview, BlockedUser, EmailPrefs, NotificationPrefs, UserSettings } from "@/types/platform";

/* ------------------------------------------------------------------ account */

interface AccountGroupProps {
  user: AuthUser;
  isSending: boolean;
  verifyMessage: string | null;
  onSendVerification: () => void;
}

export function AccountGroup({ user, isSending, verifyMessage, onSendVerification }: AccountGroupProps) {
  const router = useRouter();
  const { signOut } = usePlatform();

  return (
    <div className="space-y-5">
      <Section>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <p className="truncate font-medium text-white">{user.email}</p>
            {user.emailVerified ? (
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-accent">
                <BadgeCheck className="size-4" aria-hidden /> Email verified
              </p>
            ) : (
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-white/70">
                <MailWarning className="size-4 text-primary" aria-hidden /> Not verified yet
              </p>
            )}
          </div>
          {!user.emailVerified && (
            <Button size="sm" onClick={onSendVerification} disabled={isSending} className="h-9 gap-1.5 rounded-full bg-gradient-brand px-4 text-white hover:opacity-90">
              {isSending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
              Send verification email
            </Button>
          )}
        </div>
        {!user.emailVerified && <p className="mt-3 text-xs leading-relaxed text-white/60">We only send match and message emails to verified addresses.</p>}
        {verifyMessage && (
          <p role="status" className="mt-3 text-sm text-white/70">
            {verifyMessage}
          </p>
        )}
      </Section>

      <Section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium text-white">Sign out</p>
            <p className="mt-0.5 text-sm text-white/70">You&apos;ll need to sign in again on this device.</p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              signOut();
              router.push("/login");
            }}
            className="h-10 gap-2 rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]"
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </Button>
        </div>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ privacy & AI */

/** Who can see what — every line here matches what the API actually returns (public profile shape, report and messages). */
const VISIBILITY: Array<{ what: string; who: string }> = [
  { what: "Your name, age, city, photo and bio", who: "Everyone on SoulSync" },
  { what: "Your interests and what you're looking for", who: "Everyone on SoulSync" },
  { what: "What you have in common with a match", who: "You and that person" },
  { what: "Your interview answers", who: "Only you" },
  { what: "Your full personality report", who: "Only you" },
  { what: "Your messages", who: "You and the person you're talking to" },
];

export function PrivacyGroup() {
  return (
    <div className="space-y-5">
      <Section title="Who sees what" description="The short version of how your information is shared.">
        <dl className="divide-y divide-white/5">
          {VISIBILITY.map((row) => (
            <div key={row.what} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
              <dt className="text-sm text-white/80">{row.what}</dt>
              <dd className="text-sm font-medium text-white sm:text-right">{row.who}</dd>
            </div>
          ))}
        </dl>
        <ul className="mt-4 space-y-1.5 text-xs leading-relaxed text-white/60">
          <li>Your answers are also sent to outside AI services so your report can be written.</li>
          <li>If someone reports a conversation, our moderators can see it to review the report.</li>
        </ul>
      </Section>

      <Section title="Your AI report">
        <ul className="divide-y divide-white/5">
          {[
            { href: "/personality-report", label: "View my AI report", hint: "Only you can see it." },
            { href: "/ai-interview", label: "Redo my interview", hint: "Answer again if the report doesn't feel like you." },
            { href: "/how-our-ai-works", label: "How our AI works", hint: "What it does, and where it can be wrong." },
          ].map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="flex min-h-14 items-center justify-between gap-4 rounded-lg py-3 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-ring">
                <span>
                  <span className="block text-sm font-medium text-white">{link.label}</span>
                  <span className="block text-xs text-white/60">{link.hint}</span>
                </span>
                <span aria-hidden className="text-white/50">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ notifications */

type PrefGroup = "notifications" | "email";

const NOTIFICATION_ROWS: Array<{ key: keyof NotificationPrefs; label: string; description: string }> = [
  { key: "like", label: "Someone likes you", description: "When someone likes your profile." },
  { key: "match", label: "You match with someone", description: "When you and someone else both say yes." },
  { key: "message", label: "New messages", description: "New messages in your conversations." },
  { key: "profileView", label: "Someone views your profile", description: "A daily summary when people view your profile." },
  { key: "aiRecommendation", label: "New suggestions for you", description: "When your AI matches are ready or a great match joins." },
];

const EMAIL_ROWS: Array<{ key: keyof EmailPrefs; label: string; description: string }> = [
  { key: "matches", label: "Emails about new matches", description: "An email when you get a new match." },
  { key: "messages", label: "Emails about unread messages", description: "If you're offline, at most one email per conversation every 30 minutes." },
  { key: "weeklyReport", label: "A weekly summary of your matches", description: "Your top AI matches and activity, every Monday." },
  { key: "referrals", label: "Updates about people you've invited", description: "When a friend you invited joins." },
];

interface NotificationsGroupProps {
  settings: UserSettings | null;
  /** The key that was just saved (shown as "Saved" for a moment). */
  savedGroup: PrefGroup | null;
  onToggle: <G extends PrefGroup>(group: G, key: keyof UserSettings[G], value: boolean) => void;
  onSetAll: (group: PrefGroup, value: boolean) => void;
}

export function NotificationsGroup({ settings, savedGroup, onToggle, onSetAll }: NotificationsGroupProps) {
  return (
    <div className="space-y-5">
      <Section
        title="In the app"
        description="The bell in the top bar and live pop-ups."
        actions={<GroupControls group="notifications" values={settings?.notifications} saved={savedGroup === "notifications"} onSetAll={onSetAll} />}
      >
        <PreferenceList rows={NOTIFICATION_ROWS} values={settings?.notifications} onChange={(key, v) => onToggle("notifications", key, v)} />
      </Section>

      <Section
        title="Email"
        description="Only things you can turn off here."
        actions={<GroupControls group="email" values={settings?.email} saved={savedGroup === "email"} onSetAll={onSetAll} />}
      >
        <PreferenceList rows={EMAIL_ROWS} values={settings?.email} onChange={(key, v) => onToggle("email", key, v)} />
      </Section>

      <p className="px-1 text-xs leading-relaxed text-white/60">
        We never send marketing email. Account emails — confirming your address, receipts, safety notices — always send.
      </p>
    </div>
  );
}

/** "Turn all off / on" for a group, and a quiet "Saved" that fades after a moment. */
function GroupControls<K extends string>({
  group,
  values,
  saved,
  onSetAll,
}: {
  group: PrefGroup;
  values: Record<K, boolean> | undefined;
  saved: boolean;
  onSetAll: (group: PrefGroup, value: boolean) => void;
}) {
  const anyOn = values ? Object.values<boolean>(values).some(Boolean) : false;
  return (
    <div className="flex items-center gap-3">
      <span role="status" className={`flex items-center gap-1 text-xs text-accent transition-opacity duration-500 ${saved ? "opacity-100" : "opacity-0"}`}>
        {saved && (
          <>
            <Check className="size-3.5" aria-hidden />
            Saved
          </>
        )}
      </span>
      <button
        type="button"
        disabled={!values}
        onClick={() => onSetAll(group, !anyOn)}
        className="min-h-9 rounded-md px-2 text-xs font-medium text-accent underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {anyOn ? "Turn all off" : "Turn all on"}
      </button>
    </div>
  );
}

function PreferenceList<K extends string>({
  rows,
  values,
  onChange,
}: {
  rows: Array<{ key: K; label: string; description: string }>;
  values: Record<K, boolean> | undefined;
  onChange: (key: K, value: boolean) => void;
}) {
  return (
    <ul className="divide-y divide-white/5">
      {rows.map(({ key, label, description }) => {
        const id = `pref-${key}`;
        return (
          <li key={key} className="flex min-h-14 items-center justify-between gap-4 py-3">
            <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
              <p className="text-sm font-medium text-white">{label}</p>
              <p className="mt-0.5 text-xs text-white/60">{description}</p>
            </label>
            {values ? (
              <Switch id={id} checked={values[key]} onCheckedChange={(v) => onChange(key, v)} />
            ) : (
              // Until the real values arrive, show a placeholder — never a switch that claims to be "on".
              <span aria-hidden className="skeleton-pulse h-6 w-11 shrink-0 rounded-full bg-white/10" />
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ plan */

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : null;

/** A short summary of where you stand; the full page (payments, cancelling) stays at /billing. */
export function PlanGroup() {
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getBillingOverview()
      .then((o) => active && setOverview(o))
      .catch((err) => active && setError(errorMessage(err, "Couldn't load your plan.")));
    return () => {
      active = false;
    };
  }, []);

  if (error) return <Section><p role="alert" className="text-sm text-destructive">{error}</p></Section>;
  if (!overview) {
    return (
      <Section>
        <div role="status" aria-label="Loading your plan" className="space-y-3">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </Section>
    );
  }

  const sub = overview.subscription;
  const isFree = sub.plan === "free";
  const date = formatDate(sub.expiryDate);
  const ending = sub.cancelAtPeriodEnd;

  let headline: string;
  let detail: string;
  if (isFree) {
    headline = "You're on Free.";
    detail = overview.billingEnabled
      ? "Upgrade for unlimited likes, sharper discovery and the full AI matchmaking experience."
      : "Paid plans are coming soon.";
  } else if (ending) {
    headline = `${sub.planName}${date ? ` · ends ${date}` : ""}`;
    detail = "You'll keep everything until then.";
  } else if (sub.source === "grant") {
    headline = `${sub.planName} · complimentary${date ? ` until ${date}` : ""}`;
    detail = "Included with your account.";
  } else {
    headline = `${sub.planName}${date ? ` · renews ${date}` : ""}`;
    detail = sub.status === "past_due" ? "Your last payment didn't go through — open billing to fix it." : "Thanks for supporting SoulSync.";
  }

  return (
    <Section>
      <p className="text-xs font-medium uppercase tracking-wider text-white/60">Current plan</p>
      <p className="mt-1 font-display text-2xl font-semibold text-white">{headline}</p>
      <p className="mt-1 text-sm text-white/70">{detail}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        {isFree ? (
          overview.billingEnabled && (
            <Button asChild className="h-10 rounded-full bg-gradient-brand px-5 text-white hover:opacity-90">
              <Link href="/pricing">See Premium</Link>
            </Button>
          )
        ) : (
          <Button asChild className="h-10 rounded-full bg-gradient-brand px-5 text-white hover:opacity-90">
            <Link href="/billing">Manage plan</Link>
          </Button>
        )}
        <Button asChild variant="outline" className="h-10 rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]">
          <Link href="/billing">Plan &amp; billing details</Link>
        </Button>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ blocked */

export function BlockedGroup({ blocks, onUnblock }: { blocks: BlockedUser[]; onUnblock: (userId: string) => void }) {
  return (
    <Section description="They can't see you, like you or message you — and you won't see them.">
      {blocks.length === 0 ? (
        <div className="flex min-h-24 flex-col items-center justify-center gap-2 py-3 text-center text-sm text-white/70">
          <UserX className="size-6 text-white/60" aria-hidden />
          You haven&apos;t blocked anyone.
        </div>
      ) : (
        <ul className="divide-y divide-white/5">
          {blocks.map(({ user: blocked, blockedAt }) => (
            <li key={blocked.id} className="flex items-center gap-3 py-3">
              <ProfileMedia src={blocked.profileImage} initials={getInitials(blocked.fullName)} thumb className="size-10 shrink-0 rounded-full text-sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{blocked.fullName}</p>
                <p className="text-xs text-white/60">Blocked {new Date(blockedAt).toLocaleDateString()}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => onUnblock(blocked.id)} className="h-9 rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]">
                Unblock
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ help */

export function HelpGroup() {
  return (
    <Section>
      <ul className="divide-y divide-white/5">
        <li>
          <Link href="/how-our-ai-works" className="flex min-h-14 items-center justify-between gap-4 rounded-lg py-3 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-ring">
            <span>
              <span className="block text-sm font-medium text-white">How our AI works</span>
              <span className="block text-xs text-white/60">What it does, what it doesn&apos;t, and where it can be wrong.</span>
            </span>
            <span aria-hidden className="text-white/50">→</span>
          </Link>
        </li>
        <li>
          <Link href="/pricing" className="flex min-h-14 items-center justify-between gap-4 rounded-lg py-3 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-ring">
            <span>
              <span className="block text-sm font-medium text-white">Plans</span>
              <span className="block text-xs text-white/60">What Free and Premium include.</span>
            </span>
            <span aria-hidden className="text-white/50">→</span>
          </Link>
        </li>
        <li>
          <a href={SOURCE_CODE_URL} target="_blank" rel="noopener noreferrer" className="flex min-h-14 items-center justify-between gap-4 rounded-lg py-3 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-ring">
            <span>
              <span className="block text-sm font-medium text-white">
                See the code
                <span className="sr-only"> (opens in a new tab)</span>
              </span>
              <span className="block text-xs text-white/60">SoulSync is built in the open.</span>
            </span>
            <ExternalLink className="size-4 text-white/50" aria-hidden />
          </a>
        </li>
      </ul>
    </Section>
  );
}
