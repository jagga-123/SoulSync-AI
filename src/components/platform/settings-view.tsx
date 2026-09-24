"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Loader2, MailWarning, UserX } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AppPage, Section } from "@/components/platform/app-page";
import { ProfileMedia } from "@/components/shared/profile-media";
import { getBlocks, getSettings, resendVerification, unblockUser, updateSettings } from "@/lib/api/platform";
import { getCurrentUser } from "@/lib/api/auth";
import { errorMessage } from "@/lib/gate";
import { getInitials } from "@/lib/format";
import type { AuthUser } from "@/types/api";
import type { BlockedUser, EmailPrefs, NotificationPrefs, UserSettings } from "@/types/platform";


const NOTIFICATION_ROWS: Array<{ key: keyof NotificationPrefs; label: string; description: string }> = [
  { key: "like", label: "Likes", description: "When someone likes your profile." },
  { key: "match", label: "Matches", description: "When you and someone else both say yes." },
  { key: "message", label: "Messages", description: "New messages in your conversations." },
  { key: "profileView", label: "Profile views", description: "A daily summary when people view your profile." },
  { key: "aiRecommendation", label: "AI recommendations", description: "When your AI matches are ready or a great match joins." },
];

const EMAIL_ROWS: Array<{ key: keyof EmailPrefs; label: string; description: string }> = [
  { key: "matches", label: "Match alerts", description: "An email when you get a new match." },
  { key: "messages", label: "Message alerts", description: "If you're offline, at most one email per conversation every 30 minutes." },
  { key: "weeklyReport", label: "Weekly compatibility report", description: "Your top AI matches and activity, every Monday." },
  { key: "referrals", label: "Referral updates", description: "When a friend you invited joins." },
];

export function SettingsView() {
  return (
    <AppPage title="Settings" description="Control how and when SoulSync AI gets in touch." width="wide">
      {(user) => <Settings initialUser={user} />}
    </AppPage>
  );
}

function Settings({ initialUser }: { initialUser: AuthUser }) {
  const [user, setUser] = useState(initialUser);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [blocks, setBlocks] = useState<BlockedUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, b, me] = await Promise.all([getSettings(), getBlocks(), getCurrentUser()]);
      setSettings(s.settings);
      setBlocks(b.blocks);
      setUser(me.user);
    } catch (err) {
      setError(errorMessage(err, "Couldn't load your settings."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle<G extends "notifications" | "email">(group: G, key: keyof UserSettings[G], value: boolean) {
    if (!settings) return;
    const previous = settings;
    setSettings({ ...settings, [group]: { ...settings[group], [key]: value } });
    setError(null);
    try {
      const saved = await updateSettings({ [group]: { [key]: value } });
      setSettings(saved.settings);
    } catch (err) {
      setSettings(previous);
      setError(errorMessage(err, "Couldn't save that change."));
    }
  }

  async function sendVerification() {
    setIsSending(true);
    setVerifyMessage(null);
    try {
      const { alreadyVerified } = await resendVerification();
      setVerifyMessage(alreadyVerified ? "Your email is already verified." : "Verification email sent — check your inbox.");
      if (alreadyVerified) await load();
    } catch (err) {
      setVerifyMessage(errorMessage(err));
    } finally {
      setIsSending(false);
    }
  }

  async function unblock(userId: string) {
    setBlocks((prev) => prev.filter((b) => b.user.id !== userId));
    await unblockUser(userId).catch(() => void load());
  }

  return (
    // From tablet up: Account | Blocked people on the first row, Notifications | Email on the second —
    // cards that share a row have similar heights, so nothing is stretched to fill empty space.
    // (On phones they stack in their natural order.)
    <div className="grid gap-5 md:grid-cols-2">
      {error && (
        <Alert variant="destructive" className="md:col-span-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Section title="Account" className="md:order-1">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <p className="truncate font-medium text-white">{user.email}</p>
            {user.emailVerified ? (
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-accent">
                <BadgeCheck className="size-4" /> Email verified
              </p>
            ) : (
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-white/55">
                <MailWarning className="size-4 text-primary" /> Not verified yet
              </p>
            )}
          </div>
          {!user.emailVerified && (
            <Button size="sm" onClick={() => void sendVerification()} disabled={isSending} className="h-8 gap-1.5 rounded-full bg-gradient-brand px-4 text-white hover:opacity-90">
              {isSending && <Loader2 className="size-3.5 animate-spin" />}
              Send verification email
            </Button>
          )}
        </div>
        {!user.emailVerified && <p className="mt-3 text-xs leading-relaxed text-white/60">We only send match and message emails to verified addresses.</p>}
        {verifyMessage && <p role="status" className="mt-3 text-sm text-white/65">{verifyMessage}</p>}
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/8 pt-4 text-sm">
          <span className="text-white/50">Subscription</span>
          <Link href="/billing" className="font-medium text-accent hover:underline">
            Plan &amp; billing →
          </Link>
        </div>
      </Section>

      <Section title="In-app notifications" description="The bell in the top bar and live pop-ups." className="md:order-3">
        <PreferenceList rows={NOTIFICATION_ROWS} values={settings?.notifications} onChange={(key, v) => void toggle("notifications", key, v)} />
      </Section>

      <Section title="Email" description="We never send marketing email — only things you can turn off here." className="md:order-4">
        <PreferenceList rows={EMAIL_ROWS} values={settings?.email} onChange={(key, v) => void toggle("email", key, v)} />
        <p className="mt-4 text-xs text-white/60">Account emails (verification, receipts, safety notices) are always sent.</p>
      </Section>

      <Section title="Blocked people" description="They can't see you, like you or message you — and you won't see them." className="md:order-2">
        {blocks.length === 0 ? (
          <div className="flex h-full min-h-20 flex-col items-center justify-center gap-2 py-3 text-center text-sm text-white/60">
            <UserX className="size-6 text-white/60" />
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
                <Button variant="outline" size="sm" onClick={() => void unblock(blocked.id)} className="rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]">
                  Unblock
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>
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
          <li key={key} className="flex items-center justify-between gap-4 py-3">
            <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
              <p className="text-sm font-medium text-white">{label}</p>
              <p className="mt-0.5 text-xs text-white/60">{description}</p>
            </label>
            {values ? (
              <Switch id={id} checked={values[key]} onCheckedChange={(v) => onChange(key, v)} />
            ) : (
              // Until the real values arrive, show a placeholder — never a switch that claims to be "on".
              <span aria-hidden className="h-6 w-11 shrink-0 animate-pulse rounded-full bg-white/10" />
            )}
          </li>
        );
      })}
    </ul>
  );
}
