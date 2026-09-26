"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Bell, ChevronLeft, ChevronRight, CreditCard, LifeBuoy, ShieldCheck, UserRound, UserX } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { AppPage } from "@/components/platform/app-page";
import {
  AccountGroup,
  BlockedGroup,
  HelpGroup,
  NotificationsGroup,
  PlanGroup,
  PrivacyGroup,
} from "@/components/settings/settings-groups";
import { getBlocks, getSettings, resendVerification, unblockUser, updateSettings } from "@/lib/api/platform";
import { getCurrentUser } from "@/lib/api/auth";
import { errorMessage } from "@/lib/gate";
import { cn } from "@/lib/utils";
import type { AuthUser } from "@/types/api";
import type { BlockedUser, UserSettings } from "@/types/platform";

/** The settings groups, in order. On a laptop they are a left-hand list; on a phone the list is the first screen and each group opens on its own. */
const GROUPS: Array<{ id: string; label: string; blurb: string; icon: LucideIcon }> = [
  { id: "account", label: "Account", blurb: "Email, verification, sign out", icon: UserRound },
  { id: "privacy", label: "Privacy & AI", blurb: "Who sees what, your AI report", icon: ShieldCheck },
  { id: "notifications", label: "Notifications", blurb: "In the app and by email", icon: Bell },
  { id: "plan", label: "Plan & billing", blurb: "Your plan at a glance", icon: CreditCard },
  { id: "blocked", label: "Blocked people", blurb: "Who you've blocked", icon: UserX },
  { id: "help", label: "Help & about", blurb: "How our AI works, plans, the code", icon: LifeBuoy },
];

const NOTIFICATION_KEYS = ["like", "match", "message", "profileView", "aiRecommendation"] as const;
const EMAIL_KEYS = ["matches", "messages", "weeklyReport", "referrals"] as const;

export function SettingsView() {
  return (
    <AppPage title="Settings" description="Your account, your privacy, your rules." width="wide">
      {(user) => <Settings initialUser={user} />}
    </AppPage>
  );
}

function Settings({ initialUser }: { initialUser: AuthUser }) {
  const params = useSearchParams();
  const requested = params.get("group");
  const chosen = GROUPS.find((g) => g.id === requested);
  // Phones: no group in the address = the list; a group = that group's own screen. Laptops always show both, defaulting to Account.
  const active = chosen ?? GROUPS[0];
  const showList = !chosen;

  const [user, setUser] = useState(initialUser);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [blocks, setBlocks] = useState<BlockedUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [savedGroup, setSavedGroup] = useState<"notifications" | "email" | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // When you move to another group, keyboard focus follows to its heading.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [chosen?.id]);

  useEffect(() => () => void (savedTimer.current && clearTimeout(savedTimer.current)), []);

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

  function flashSaved(group: "notifications" | "email") {
    setSavedGroup(group);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedGroup(null), 1600);
  }

  async function toggle<G extends "notifications" | "email">(group: G, key: keyof UserSettings[G], value: boolean) {
    if (!settings) return;
    const previous = settings;
    setSettings({ ...settings, [group]: { ...settings[group], [key]: value } });
    setError(null);
    try {
      const saved = await updateSettings({ [group]: { [key]: value } });
      setSettings(saved.settings);
      flashSaved(group);
    } catch (err) {
      setSettings(previous);
      setError(errorMessage(err, "Couldn't save that change."));
    }
  }

  async function setAll(group: "notifications" | "email", value: boolean) {
    if (!settings) return;
    const previous = settings;
    const keys = group === "notifications" ? NOTIFICATION_KEYS : EMAIL_KEYS;
    const all = Object.fromEntries(keys.map((k) => [k, value]));
    setSettings({ ...settings, [group]: { ...settings[group], ...all } });
    setError(null);
    try {
      const saved = await updateSettings({ [group]: all });
      setSettings(saved.settings);
      flashSaved(group);
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
    <div className="grid gap-6 md:grid-cols-[240px_minmax(0,1fr)] md:gap-10">
      <nav aria-label="Settings sections" className={cn("md:sticky md:top-28 md:self-start", showList ? "block" : "hidden md:block")}>
        <ul className="divide-y divide-white/8 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] md:divide-y-0 md:border-0 md:bg-transparent md:p-0">
          {GROUPS.map((group) => {
            const current = group.id === active.id;
            return (
              <li key={group.id}>
                <Link
                  href={`/settings?group=${group.id}`}
                  scroll={false}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 items-center gap-3 px-4 py-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:rounded-xl md:px-3",
                    current ? "md:bg-white/10 md:text-white" : "md:hover:bg-white/5",
                  )}
                >
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl ring-1", current ? "bg-gradient-brand text-white ring-transparent" : "bg-white/5 text-accent ring-white/10")}>
                    <group.icon className="size-[18px]" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-white">{group.label}</span>
                    <span className="block truncate text-xs text-white/60 md:hidden">{group.blurb}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-white/50 md:hidden" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className={cn("min-w-0 md:max-w-[640px]", showList ? "hidden md:block" : "block")}>
        {!showList && (
          <Link href="/settings" className="mb-4 inline-flex min-h-10 items-center gap-1 rounded-md pr-2 text-sm font-medium text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring md:hidden">
            <ChevronLeft className="size-4" aria-hidden />
            Settings
          </Link>
        )}
        <h2 ref={headingRef} tabIndex={-1} className="mb-5 font-display text-2xl font-semibold text-white outline-none">
          {active.label}
        </h2>

        {error && (
          <Alert variant="destructive" className="mb-5">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {active.id === "account" && <AccountGroup user={user} isSending={isSending} verifyMessage={verifyMessage} onSendVerification={() => void sendVerification()} />}
        {active.id === "privacy" && <PrivacyGroup />}
        {active.id === "notifications" && (
          <NotificationsGroup
            settings={settings}
            savedGroup={savedGroup}
            onToggle={(group, key, value) => void toggle(group, key, value)}
            onSetAll={(group, value) => void setAll(group, value)}
          />
        )}
        {active.id === "plan" && <PlanGroup />}
        {active.id === "blocked" && <BlockedGroup blocks={blocks} onUnblock={(id) => void unblock(id)} />}
        {active.id === "help" && <HelpGroup />}
      </div>
    </div>
  );
}
