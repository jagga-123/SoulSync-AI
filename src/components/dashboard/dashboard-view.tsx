"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  HeartHandshake,
  CalendarDays,
  CircleUserRound,
  CreditCard,
  Compass,
  Crown,
  Gift,
  Heart,
  LogOut,
  MailWarning,
  MapPin,
  MessageCircle,
  Pencil,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AvatarOrb } from "@/components/ui/avatar-orb";
import { AIDashboardSection } from "@/components/ai/ai-dashboard-section";
import { usePlatform } from "@/components/platform/platform-provider";
import { PLAN_NAMES } from "@/lib/gate";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { getMyProfile } from "@/lib/api/profile";
import { getIncomingLikes } from "@/lib/api/likes";
import { getMatches } from "@/lib/api/matches";
import { getConversations } from "@/lib/api/conversations";
import { clearToken } from "@/lib/auth-storage";
import type { UserProfile } from "@/types/api";

const GOAL_LABELS: Record<string, string> = {
  casual: "Casual dating",
  serious: "Serious relationship",
  friendship: "Friendship",
  "not-sure": "Not sure yet",
};

function getInitials(fullName: string): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function getCompletionPercent(profile: UserProfile | null): number {
  if (!profile) return 0;
  let score = 60;
  if (profile.bio && profile.bio.trim().length > 0) score += 15;
  if (profile.interests.length > 0) score += 15;
  if (profile.profileImage) score += 10;
  return score;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function DashboardView() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useRequireAuth();
  const { features } = usePlatform();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [incomingCount, setIncomingCount] = useState(0);
  const [matchesCount, setMatchesCount] = useState(0);
  const [conversationsCount, setConversationsCount] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    let active = true;

    getMyProfile()
      .then(({ profile }) => {
        if (active) setProfile(profile);
      })
      .catch(() => {
        if (active) setProfile(null);
      })
      .finally(() => {
        if (active) setIsProfileLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let active = true;

    // Quick-action badge counts — best-effort, silently ignored on failure
    // so a hiccup here never blocks the rest of the dashboard.
    getIncomingLikes()
      .then(({ likes }) => {
        if (active) setIncomingCount(likes.length);
      })
      .catch(() => {});

    getMatches()
      .then(({ matches }) => {
        if (active) setMatchesCount(matches.length);
      })
      .catch(() => {});

    getConversations()
      .then(({ conversations }) => {
        if (!active) return;
        setConversationsCount(conversations.length);
        setUnreadMessagesCount(conversations.reduce((sum, c) => sum + c.unreadCount, 0));
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [user]);

  function handleSignOut() {
    clearToken();
    router.push("/login");
  }

  if (isAuthLoading || !user) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Sparkles className="size-6 animate-pulse text-white/60" />
      </div>
    );
  }

  const completion = getCompletionPercent(profile);
  const firstName = user.fullName.split(" ")[0];

  return (
    <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-28 sm:px-6 lg:px-8">
      <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <AvatarOrb
            initials={getInitials(user.fullName)}
            gradient="from-primary to-secondary"
            className="size-14 text-lg"
          />
          <div>
            <h1 className="font-display text-2xl font-semibold text-white sm:text-3xl">
              Welcome back, {firstName}
            </h1>
            <p className="text-sm text-white/50">{user.email}</p>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={handleSignOut}
          className="gap-2 rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]"
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
      </div>

      {user.emailVerified === false && (
        <Link
          href="/settings"
          className="mt-6 flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/[0.07] p-4 text-sm text-white/75 transition-colors hover:bg-primary/[0.1]"
        >
          <MailWarning className="size-5 shrink-0 text-primary" />
          <span className="flex-1">
            <strong className="font-semibold text-white">Verify your email</strong> to get match and message alerts. We sent a link when you signed up — or send a new one.
          </span>
          <span className="shrink-0 font-medium text-accent">Open settings</span>
        </Link>
      )}

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
        <div className="glass rounded-3xl p-5 sm:p-6">
          <div className="flex items-center gap-2 text-white/50">
            <CircleUserRound className="size-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Account</span>
          </div>
          <p className="mt-3 font-display text-lg font-semibold text-white">{user.fullName}</p>
          <Badge variant="outline" className="mt-2 border-white/15 text-white/70">
            {user.role}
          </Badge>
          <div className="mt-4 flex items-center gap-1.5 text-xs text-white/60">
            <CalendarDays className="size-3.5" />
            Member since {formatDate(user.createdAt)}
          </div>
        </div>

        <div className="glass rounded-3xl p-5 sm:p-6">
          <div className="flex items-center gap-2 text-white/50">
            <Sparkles className="size-4" />
            <span className="text-xs font-medium uppercase tracking-wider">
              Profile completion
            </span>
          </div>
          <p className="mt-3 font-display text-3xl font-semibold text-white">
            {isProfileLoading ? "—" : `${completion}%`}
          </p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary via-secondary to-accent transition-all duration-700"
              style={{ width: `${isProfileLoading ? 0 : completion}%` }}
            />
          </div>
          <p className="mt-3 text-xs text-white/60">
            {!profile
              ? "Complete your profile to start matching."
              : completion < 100
                ? "Add a bio, interests and photo for a stronger profile."
                : "Your profile is complete."}
          </p>
        </div>

        <div className="glass rounded-3xl p-5 sm:p-6">
          <div className="flex items-center gap-2 text-white/50">
            <Heart className="size-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Looking for</span>
          </div>
          <p className="mt-3 font-display text-lg font-semibold text-white">
            {profile ? GOAL_LABELS[profile.relationshipGoal] : "Not set yet"}
          </p>
          {profile && (
            <div className="mt-4 flex items-center gap-1.5 text-xs text-white/60">
              <MapPin className="size-3.5" />
              {profile.city}
            </div>
          )}
        </div>

        <Link
          href="/messages"
          className="glass block rounded-3xl p-5 transition-colors hover:border-white/25 sm:p-6"
        >
          <div className="flex items-center gap-2 text-white/50">
            <MessageCircle className="size-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Messages</span>
          </div>
          <p className="mt-3 font-display text-3xl font-semibold text-white">
            {conversationsCount}
          </p>
          <p className="text-xs text-white/60">
            conversation{conversationsCount === 1 ? "" : "s"}
          </p>
          <div className="mt-4 flex items-center gap-1.5 text-xs">
            {unreadMessagesCount > 0 ? (
              <>
                <span className="size-1.5 rounded-full bg-accent" />
                <span className="text-accent">{unreadMessagesCount} unread</span>
              </>
            ) : (
              <span className="text-white/60">All caught up</span>
            )}
          </div>
        </Link>
      </div>

      {features && (
        <Link
          href={features.plan === "free" ? "/pricing" : "/premium"}
          className="glass mt-5 flex items-center gap-4 rounded-3xl p-4 transition-colors hover:border-white/25 sm:p-5"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-brand text-white">
            <Crown className="size-5" />
          </span>
          <div className="min-w-0 sm:w-40 sm:shrink-0">
            <p className="text-xs font-medium uppercase tracking-wider text-white/60">Your plan</p>
            <p className="font-display text-lg font-semibold text-white">{PLAN_NAMES[features.plan]}</p>
          </div>
          <p className="hidden min-w-0 flex-1 border-l border-white/10 pl-5 text-sm text-white/55 md:block">
            {features.limits.dailyLikes === null ? "Unlimited likes" : `${features.limits.dailyLikes} likes a day`}
            {" · "}Top {features.limits.recommendations} AI matches
            {features.limits.monthlyBoosts > 0 ? ` · ${features.limits.monthlyBoosts} profile boosts a month` : ""}
          </p>
          <span className="ml-auto shrink-0 text-sm font-medium text-accent">
            {features.plan === "free" ? "See Premium" : "View perks"}
          </span>
        </Link>
      )}

      <AIDashboardSection />

      {!isProfileLoading && profile && (
        <div className="glass mt-5 rounded-3xl p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-white">Your profile</h2>
              <p className="mt-1 text-sm text-white/55">{profile.bio || "No bio added yet."}</p>
            </div>
            <Button asChild size="sm" variant="outline" className="shrink-0 gap-1.5 rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]">
              <Link href="/onboarding">
                <Pencil className="size-3.5" />
                Edit
              </Link>
            </Button>
          </div>
          {profile.interests.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {profile.interests.map((interest) => (
                <span
                  key={interest}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/70"
                >
                  {interest}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-10">
        <h2 className="font-display text-lg font-semibold text-white">Quick actions</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-5">
          <QuickAction
            href="/onboarding"
            icon={Pencil}
            title={profile ? "Edit profile" : "Complete profile"}
            description={profile ? "Update your details" : "Required to start matching"}
          />
          <QuickAction
            href="/discover"
            icon={Compass}
            title="Discover people"
            description="Find your next match"
          />
          <QuickAction
            href="/likes"
            icon={Heart}
            title="Likes"
            description="Incoming and outgoing"
            badge={incomingCount}
          />
          <QuickAction
            href="/matches"
            icon={Users}
            title="Matches"
            description="Everyone you've matched with"
            badge={matchesCount}
          />
          <QuickAction
            href="/ai-interview"
            icon={MessageCircle}
            title="AI interview"
            description="Chat with SoulSync AI"
          />
          <QuickAction
            href="/personality-report"
            icon={HeartHandshake}
            title="Personality report"
            description="Your AI-generated profile"
          />
          <QuickAction
            href="/#matching-demo"
            icon={Sparkles}
            title="See AI matching"
            description="Watch the live demo"
          />
          <QuickAction
            href="/notifications"
            icon={Bell}
            title="Notifications"
            description="Likes, matches and updates"
          />
          <QuickAction
            href="/referrals"
            icon={Gift}
            title="Invite friends"
            description="Share your code, earn rewards"
          />
          <QuickAction
            href="/premium"
            icon={Crown}
            title="My perks"
            description="Boosts, filters and insights"
          />
          <QuickAction
            href="/billing"
            icon={CreditCard}
            title="Plan & billing"
            description="Subscription and receipts"
          />
          <QuickAction
            href="/settings"
            icon={Settings}
            title="Account settings"
            description="Notifications, email & privacy"
          />
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  title,
  description,
  disabled = false,
  badge,
}: {
  href?: string;
  icon: typeof Pencil;
  title: string;
  description: string;
  disabled?: boolean;
  badge?: number;
}) {
  const content = (
    <div
      className={`glass group relative flex h-full flex-col gap-3 rounded-2xl p-4 transition-colors sm:p-5 ${
        disabled ? "opacity-50" : "hover:border-white/25"
      }`}
    >
      {Boolean(badge) && (
        <span className="absolute right-4 top-4 flex min-w-5 items-center justify-center rounded-full bg-gradient-brand px-1.5 py-0.5 text-xs font-semibold text-white">
          {badge}
        </span>
      )}
      <span className="flex size-9 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
        <Icon className="size-4 text-accent" />
      </span>
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-0.5 text-xs text-white/60">{description}</p>
      </div>
    </div>
  );

  if (disabled || !href) {
    return <div aria-disabled="true">{content}</div>;
  }

  return <Link href={href}>{content}</Link>;
}
