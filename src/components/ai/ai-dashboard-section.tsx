"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  HeartHandshake,
  CheckCircle2,
  MessageCircle,
  RotateCcw,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { AIMatchPill } from "@/components/ai/ai-match-pill";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AvatarOrb } from "@/components/ui/avatar-orb";
import { getAIStatus, getRecommendations } from "@/lib/api/ai";
import { ARCHETYPE_TAGLINES, capitalize } from "@/lib/ai-format";
import { getInitials } from "@/lib/format";
import type { AIRecommendation, AIStatus } from "@/types/api";

const TOP_RECOMMENDATIONS = 3;

function Card({
  icon: Icon,
  title,
  children,
  className = "",
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`glass flex flex-col rounded-3xl p-6 ${className}`}>
      <div className="flex items-center gap-2 text-white/50 md:max-lg:min-h-9 md:max-lg:items-start">
        <Icon className="size-4 shrink-0" aria-hidden />
        <h3 className="font-sans text-xs font-medium uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-5">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-56 rounded-3xl" />
      ))}
    </div>
  );
}

/** Dashboard block for the Phase 5 AI journey: interview status, personality
 * summary, and the best-matching people right now. Fetches its own data so the
 * rest of the dashboard never waits on it. */
export function AIDashboardSection() {
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [recommendations, setRecommendations] = useState<AIRecommendation[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    getAIStatus()
      .then((res) => {
        if (!active) return;
        setStatus(res.status);
        if (res.status.hasAIProfile) {
          getRecommendations(TOP_RECOMMENDATIONS)
            .then((recs) => {
              if (active) setRecommendations(recs.recommendations);
            })
            .catch(() => {
              if (active) setRecommendations([]);
            });
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
    };
  }, []);

  // Best-effort like the other dashboard extras: if it can't load, the rest
  // of the dashboard is unaffected.
  if (failed) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="mt-10"
      aria-labelledby="ai-section-title"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-accent" aria-hidden />
        <h2 id="ai-section-title" className="font-display text-lg font-semibold text-white">
          Your AI profile
        </h2>
      </div>

      <div className="mt-4">
        {!status ? (
          <SectionSkeleton />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-5">
            <InterviewCard status={status} />
            <PersonalityCard status={status} />
            <InsightsCard status={status} recommendations={recommendations} />
          </div>
        )}
      </div>
    </motion.section>
  );
}

function InterviewCard({ status }: { status: AIStatus }) {
  const { interview, hasBasicProfile } = status;
  const percent = Math.min(100, Math.round((interview.answered / interview.max) * 100));

  return (
    <Card icon={MessageCircle} title="AI interview">
      {interview.status === "completed" ? (
        <>
          <p className="mt-3 flex items-center gap-2 font-display text-lg font-semibold text-white">
            <CheckCircle2 className="size-5 text-accent" aria-hidden />
            Complete
          </p>
          <p className="mb-4 mt-1 text-sm text-white/55">
            Sol has learned who you are from {interview.answered} answers.
          </p>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="mt-auto w-fit gap-1.5 rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]"
          >
            <Link href="/ai-interview">
              <RotateCcw className="size-3.5" />
              Retake interview
            </Link>
          </Button>
        </>
      ) : interview.status === "in_progress" || interview.status === "analyzing" ? (
        <>
          <p className="mt-3 font-display text-lg font-semibold text-white">In progress</p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary via-secondary to-accent transition-all duration-700"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mb-4 mt-2 text-xs text-white/60">
            {interview.answered} answered
            {interview.canFinish ? " · you can finish any time" : ` · ${interview.min - interview.answered} more to unlock your report`}
          </p>
          <Button
            asChild
            size="sm"
            className="mt-auto w-fit gap-1.5 rounded-full bg-gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-90"
          >
            <Link href="/ai-interview">
              Continue
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </>
      ) : (
        <>
          <p className="mt-3 font-display text-lg font-semibold text-white">Not started</p>
          <p className="mb-4 mt-1 text-sm text-white/55">
            Chat with Sol for about 10 minutes so it can learn your personality, values and
            what you want.
          </p>
          <Button
            asChild
            size="sm"
            className="mt-auto w-fit gap-1.5 rounded-full bg-gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-90"
          >
            <Link href={hasBasicProfile ? "/ai-interview" : "/onboarding"}>
              {hasBasicProfile ? "Start AI interview" : "Complete profile first"}
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </>
      )}
    </Card>
  );
}

function PersonalityCard({ status }: { status: AIStatus }) {
  const profile = status.aiProfile;

  if (!profile) {
    return (
      <Card icon={HeartHandshake} title="Personality">
        <p className="mt-3 font-display text-lg font-semibold text-white/60">Not analysed yet</p>
        <p className="mt-1 text-sm text-white/60">
          Finish your AI interview to unlock your personality type, strengths and communication style.
        </p>
      </Card>
    );
  }

  return (
    <Card icon={HeartHandshake} title="Personality">
      <p className="mt-3 font-display text-2xl font-semibold">
        <span className="text-gradient-brand">{profile.personalityType}</span>
      </p>
      <span className="mt-2 w-fit rounded-full border border-secondary/40 bg-secondary/15 px-2.5 py-0.5 text-xs font-medium text-white/85">
        {capitalize(profile.communicationStyle)} communicator
      </span>
      <p className="mb-4 mt-3 line-clamp-3 text-sm leading-relaxed text-white/55">
        {ARCHETYPE_TAGLINES[profile.personalityType] ?? profile.summary}
      </p>
      <Button
        asChild
        variant="outline"
        size="sm"
        className="mt-auto w-fit gap-1.5 rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]"
      >
        <Link href="/personality-report">
          View full report
          <ArrowRight className="size-3.5" />
        </Link>
      </Button>
    </Card>
  );
}

function InsightsCard({
  status,
  recommendations,
}: {
  status: AIStatus;
  recommendations: AIRecommendation[] | null;
}) {
  if (!status.hasAIProfile) {
    return (
      <Card icon={TrendingUp} title="Why you might click">
        <p className="mt-3 font-display text-lg font-semibold text-white/60">Locked</p>
        <p className="mt-1 text-sm text-white/60">
          Finish your interview and every profile you see comes with the reasons you two might click.
        </p>
      </Card>
    );
  }

  return (
    <Card icon={TrendingUp} title="Why you might click">
      {recommendations === null ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-12 rounded-2xl" />
          <Skeleton className="h-12 rounded-2xl" />
          <Skeleton className="h-12 rounded-2xl" />
        </div>
      ) : recommendations.length === 0 ? (
        <>
          <p className="mt-3 font-display text-lg font-semibold text-white">No matches to rank yet</p>
          <p className="mt-1 text-sm text-white/55">
            As more people finish their AI interviews, your best matches show up here.
          </p>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm text-white/55">Your top matches right now</p>
          <ul className="mt-3 space-y-2.5">
            {recommendations.map(({ user, ai }) => (
              <li key={user.id}>
                <Link
                  href="/discover"
                  className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-2.5 transition-colors hover:border-white/20"
                >
                  <AvatarOrb
                    initials={getInitials(user.fullName)}
                    gradient="from-primary to-secondary"
                    className="size-9 text-xs"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{user.fullName}</p>
                    <p className="truncate text-xs text-white/60">{ai.reasons[0] ?? "Worth a conversation"}</p>
                  </div>
                  <AIMatchPill score={ai.score} tier={ai.tier} compact className="shrink-0 px-2 py-0.5 text-xs" />
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/discover"
            className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
          >
            See all AI recommendations
            <ArrowRight className="size-3" />
          </Link>
        </>
      )}
    </Card>
  );
}
