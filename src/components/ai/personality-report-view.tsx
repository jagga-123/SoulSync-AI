"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  HeartHandshake,
  CalendarDays,
  Check,
  Compass,
  Heart,
  Home,
  Loader2,
  Lock,
  MessageCircle,
  RotateCcw,
  Smile,
  Sparkles,
  Star,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HeartPulse } from "@/components/brand/heart-pulse";
import { EmptyState } from "@/components/shared/empty-state";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { getMyAIProfile } from "@/lib/api/ai";
import { ApiClientError } from "@/lib/api-client";
import {
  ARCHETYPE_TAGLINES,
  REPORT_REVEAL_KEY,
  STYLE_DESCRIPTIONS,
  TRAIT_META,
  analysisSourceLabel,
  capitalize,
  describeTrait,
} from "@/lib/ai-format";
import type { AIProfile, TraitScores } from "@/types/api";

const EASE = [0.16, 1, 0.3, 1] as const;

function Section({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.6, delay, ease: EASE }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

function CardTitle({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-white/50">
      <Icon className="size-4 text-accent" aria-hidden />
      {children}
    </h2>
  );
}

const CHIP_TONES = {
  primary: "border-primary/30 bg-primary/10 text-white/90",
  secondary: "border-secondary/40 bg-secondary/15 text-white/90",
  accent: "border-accent/30 bg-accent/10 text-accent",
  neutral: "border-white/10 bg-white/5 text-white/70",
} as const;

function ChipGroup({
  icon,
  title,
  items,
  tone,
  empty,
}: {
  icon: LucideIcon;
  title: string;
  items: string[];
  tone: keyof typeof CHIP_TONES;
  empty: string;
}) {
  return (
    <div className="glass h-full rounded-3xl p-6">
      <CardTitle icon={icon}>{title}</CardTitle>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-white/60">{empty}</p>
      ) : (
        <ul className="mt-4 flex flex-wrap gap-2">
          {items.map((item) => (
            <li
              key={item}
              className={`rounded-full border px-3 py-1.5 text-sm ${CHIP_TONES[tone]}`}
            >
              {capitalize(item)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A trait as a soft range, not a score: a dot on a track between its two ends ("Reflective … Outgoing") with the
 * plain-words read beside it ("Leans reflective"). The number stays available to assistive tech only.
 */
function TraitRange({ traitKey, value, index }: { traitKey: keyof TraitScores; value: number; index: number }) {
  const meta = TRAIT_META[traitKey];
  const read = describeTrait(traitKey, value);
  const position = Math.min(94, Math.max(6, value)); // keep the dot inside the track
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <span className="text-sm font-medium text-white">{meta.label}</span>
          <span className="ml-2 hidden text-xs text-white/60 sm:inline">{meta.blurb}</span>
        </div>
        <span className="shrink-0 text-sm font-medium text-white/85">{read}</span>
      </div>
      <div
        className="relative mt-3 h-2 rounded-full bg-gradient-to-r from-secondary/35 via-white/10 to-primary/35"
        role="meter"
        aria-label={meta.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-valuetext={read}
      >
        <motion.span
          aria-hidden
          className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-4 ring-background"
          initial={{ left: "50%" }}
          whileInView={{ left: `${position}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.9, delay: 0.15 + index * 0.08, ease: EASE }}
        />
      </div>
      <div className="mt-2 flex justify-between text-xs uppercase tracking-wide text-white/60">
        <span>{meta.low}</span>
        <span>{meta.high}</span>
      </div>
    </div>
  );
}

/** Splits a summary into sentences so the reveal can bring them in one at a time (never letter by letter). */
function sentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g)?.map((s) => s.trim()) ?? [text];
}

/** How deep the read is, in words and hearts — deliberately not a percentage, so it can't feel like a grade for the person. */
function ReadDepth({ score, answers }: { score: number; answers: number }) {
  const level = score >= 75 ? 3 : score >= 50 ? 2 : 1;
  const title = ["A first read", "A good read", "A strong read"][level - 1];
  return (
    <div className="flex max-w-[13rem] flex-col items-center gap-2 text-center md:items-end md:text-right">
      <p className="text-xs font-medium uppercase tracking-wide text-white/60">How well we know you</p>
      <p className="font-display text-2xl font-semibold text-white">{title}</p>
      <div className="flex gap-1" role="img" aria-label={`${level} of 3 hearts`}>
        {[1, 2, 3].map((i) => (
          <Heart key={i} className={i <= level ? "size-5 fill-primary text-primary" : "size-5 text-white/40"} aria-hidden />
        ))}
      </div>
      <p className="text-xs leading-snug text-white/60">
        Based on your {answers} answers.{level < 3 && " Fuller answers give a sharper read."}
      </p>
      {level < 3 && (
        <Link href="/ai-interview" className="text-xs font-medium text-accent underline-offset-2 hover:underline">
          Redo the interview
        </Link>
      )}
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-28 sm:px-6 lg:px-8">
      <Skeleton className="h-8 w-48 rounded-full" />
      <Skeleton className="h-64 w-full rounded-3xl" />
      <Skeleton className="h-40 w-full rounded-3xl" />
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-48 rounded-3xl" />
        <Skeleton className="h-48 rounded-3xl" />
      </div>
    </div>
  );
}

export function PersonalityReportView() {
  const { user, isLoading: isAuthLoading } = useRequireAuth();
  const [profile, setProfile] = useState<AIProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // True only when the person has just finished the interview: the report then opens with a one-time arrival.
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(REPORT_REVEAL_KEY)) {
        sessionStorage.removeItem(REPORT_REVEAL_KEY);
        setReveal(true);
      }
    } catch {
      /* no sessionStorage — no arrival moment, the report is unchanged */
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;

    getMyAIProfile()
      .then((res) => {
        if (active) setProfile(res.aiProfile);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiClientError && err.status === 404) setNotFound(true);
        else setError(err instanceof ApiClientError ? err.message : "Couldn't load your report.");
      });

    return () => {
      active = false;
    };
  }, [user]);

  if (isAuthLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-white/50" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-28 sm:px-6">
        <EmptyState
          icon={HeartHandshake}
          title="Your report is waiting"
          description="Chat with Sol for a few minutes and it will build your personality report — strengths, values, communication style and more."
          actionLabel="Start the AI interview"
          actionHref="/ai-interview"
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-32">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!profile) return <ReportSkeleton />;

  const tagline = ARCHETYPE_TAGLINES[profile.personalityType];
  const traitKeys = Object.keys(TRAIT_META) as (keyof TraitScores)[];
  const updated = new Date(profile.updatedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="relative mx-auto max-w-5xl px-4 py-28 sm:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/70">
          <Sparkles className="size-3.5 text-accent" aria-hidden />
          AI Personality Report
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-white/60">
          <CalendarDays className="size-3.5" aria-hidden />
          Updated {updated}
        </span>
      </motion.div>

      <p className="mt-3 flex items-center gap-2 text-sm text-white/75">
        <Lock className="size-4 shrink-0 text-accent" aria-hidden />
        Only you can see this report. Matches see just what you have in common.
      </p>

      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
        className="glass-strong relative mt-5 overflow-hidden rounded-[2rem] p-8 sm:p-12"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-secondary/30 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-28 -left-16 size-64 rounded-full bg-primary/20 blur-3xl"
        />
        <div className="relative flex flex-col items-center gap-8 text-center md:flex-row md:text-left">
          <div className="flex-1">
            {reveal && (
              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, ease: EASE }}
                role="status"
                className="mb-5 flex items-center justify-center gap-3 md:justify-start"
              >
                <HeartPulse loop={false} className="size-9" />
                <p className="font-display text-xl font-semibold text-white">Your read is ready.</p>
              </motion.div>
            )}
            <p className="text-sm text-white/60">Your personality type</p>
            <h1 className="mt-2 font-display text-5xl font-semibold leading-tight sm:text-6xl">
              <motion.span
                className="inline-block text-gradient-brand"
                initial={reveal ? { opacity: 0, y: 10 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reveal ? 0.9 : 0, duration: 0.6, ease: EASE }}
              >
                {profile.personalityType}
              </motion.span>
            </h1>
            {tagline && <p className="mt-4 max-w-lg text-pretty text-lg text-white/65">{tagline}.</p>}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 md:justify-start">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-secondary/40 bg-secondary/15 px-3 py-1 text-xs font-medium text-white/90">
                <MessageCircle className="size-3.5" aria-hidden />
                {capitalize(profile.communicationStyle)} communicator
              </span>
              {profile.relationshipGoals.slice(0, 2).map((goal) => (
                <span
                  key={goal}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-white/90"
                >
                  <Heart className="size-3.5" aria-hidden />
                  {capitalize(goal)}
                </span>
              ))}
            </div>
          </div>
          <ReadDepth score={profile.confidenceScore} answers={profile.interviewAnswerCount} />
        </div>
      </motion.section>

      {/* Summary */}
      <Section className="mt-6" delay={0.05}>
        <div className="glass rounded-3xl p-6 sm:p-8">
          <CardTitle icon={Sparkles}>AI summary</CardTitle>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-white/85">
            {reveal
              ? sentences(profile.summary).map((line, i) => (
                  <motion.span
                    key={i}
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3 + i * 0.35, duration: 0.5 }}
                  >
                    {line}{" "}
                  </motion.span>
                ))
              : profile.summary}
          </p>
        </div>
      </Section>

      {/* Communication + strengths */}
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Section>
          <div className="glass h-full rounded-3xl p-6 sm:p-8">
            <CardTitle icon={MessageCircle}>Communication style</CardTitle>
            <p className="mt-4 font-display text-2xl font-semibold text-white">
              {capitalize(profile.communicationStyle)}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-white/60">
              {STYLE_DESCRIPTIONS[profile.communicationStyle]}
            </p>
          </div>
        </Section>

        <Section delay={0.08}>
          <div className="glass h-full rounded-3xl p-6 sm:p-8">
            <CardTitle icon={Star}>Strengths</CardTitle>
            <ul className="mt-4 space-y-3">
              {profile.strengths.map((strength) => (
                <li key={strength} className="flex items-start gap-3 text-sm text-white/80">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                    <Check className="size-3" aria-hidden />
                  </span>
                  {strength}
                </li>
              ))}
            </ul>
          </div>
        </Section>
      </div>

      {/* Personality dimensions */}
      <Section className="mt-6">
        <div className="glass rounded-3xl p-6 sm:p-8">
          <CardTitle icon={HeartHandshake}>Personality dimensions</CardTitle>
          <div className="mt-6 space-y-6">
            {traitKeys.map((key, index) => (
              <TraitRange key={key} traitKey={key} value={profile.traitScores[key]} index={index} />
            ))}
          </div>
        </div>
      </Section>

      {/* Tag groups */}
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Section>
          <ChipGroup
            icon={Compass}
            title="Core values"
            items={profile.values}
            tone="primary"
            empty="No clear values came through yet."
          />
        </Section>
        <Section delay={0.06}>
          <ChipGroup
            icon={Home}
            title="Lifestyle"
            items={profile.lifestyleTraits}
            tone="secondary"
            empty="No lifestyle traits came through yet."
          />
        </Section>
        <Section>
          <ChipGroup
            icon={Smile}
            title="Emotional traits"
            items={profile.emotionalTraits}
            tone="accent"
            empty="No emotional traits came through yet."
          />
        </Section>
        <Section delay={0.06}>
          <ChipGroup
            icon={Heart}
            title="Relationship goals"
            items={profile.relationshipGoals}
            tone="primary"
            empty="No relationship goals came through yet."
          />
        </Section>
      </div>

      <Section className="mt-6">
        <ChipGroup
          icon={Sparkles}
          title="Interests"
          items={profile.interests}
          tone="neutral"
          empty="No specific interests came through yet."
        />
      </Section>

      {/* Actions + provenance */}
      <Section className="mt-10">
        <div className="glass-strong flex flex-col items-center gap-5 rounded-3xl p-8 text-center">
          <h2 className="font-display text-xl font-semibold text-white">Ready to meet people who fit?</h2>
          <p className="max-w-md text-sm text-white/55">
            Your matches are now scored on values, communication, lifestyle, goals and personality — not
            just a photo.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              asChild
              className="gap-2 rounded-full bg-gradient-brand px-6 text-white shadow-lg shadow-primary/25 hover:opacity-90"
            >
              <Link href="/discover">
                See my AI matches
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="gap-2 rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]"
            >
              <Link href="/ai-interview">
                <RotateCcw className="size-4" />
                Retake the interview
              </Link>
            </Button>
          </div>
        </div>
        <p className="mx-auto mt-5 max-w-xl text-center text-xs leading-relaxed text-white/60">
          {profile.analysisSource === "llm"
            ? "Written by AI from your answers."
            : "Built by SoulSync's own rules from your answers, not by an AI model."}{" "}
          It can be wrong —{" "}
          <Link href="/ai-interview" className="font-medium text-accent underline-offset-2 hover:underline">
            redo the interview
          </Link>{" "}
          if it doesn&apos;t feel like you. · {analysisSourceLabel(profile.analysisSource, profile.provider)}
        </p>
      </Section>
    </div>
  );
}
