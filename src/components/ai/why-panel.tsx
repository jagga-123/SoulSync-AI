"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Heart, RotateCw } from "lucide-react";

import { AIReasons } from "@/components/ai/ai-match-pill";
import { ExplanationCard } from "@/components/ai/explanation-card";
import { HeartMeter } from "@/components/ai/heart-meter";
import { TypingHearts } from "@/components/brand/heart-pulse";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { DIMENSION_LABELS, EARLY_READ_MAX_AREAS, availableAreaCount, capitalize } from "@/lib/ai-format";
import { MATCH_AREAS } from "@/lib/data";
import type { AICompatibilityState } from "@/hooks/use-ai-compatibility";
import type { AICompatibilityDetail, CompatibilityDimension } from "@/types/api";

interface WhyPanelProps {
  state: AICompatibilityState;
  firstName: string;
  onRetry: () => void;
  /** No outer margins — for use inside a sheet or other padded container. */
  flush?: boolean;
}

const DIMENSION_ORDER: CompatibilityDimension[] = ["values", "interests", "communication", "lifestyle", "relationshipGoals", "personality"];

function Shell({ children, flush = false }: { children: React.ReactNode; flush?: boolean }) {
  return <div className={`${flush ? "" : "mx-6 mb-5 "}rounded-2xl border border-white/10 bg-white/[0.03] p-4`}>{children}</div>;
}

function ChipRow({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
      <p className="w-24 shrink-0 text-xs text-white/60">{label}</p>
      <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {items.map((item) => (
          <li key={item} className="rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-xs text-accent">
            {capitalize(item)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What the six areas are and how much each counts — the same weights as the engine (see MATCH_AREAS). */
function OverlapNote({ id }: { id: string }) {
  return (
    <div id={id} className="rounded-xl bg-white/[0.04] p-3 text-xs leading-relaxed text-white/70">
      <p>
        We compare six areas. Values count the most ({MATCH_AREAS[0].weight}%), personality the least (
        {MATCH_AREAS[MATCH_AREAS.length - 1].weight}%). It&apos;s a guide, not a guarantee.
      </p>
      <ul className="mt-2 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
        {MATCH_AREAS.map((area) => (
          <li key={area.label} className="flex justify-between gap-3">
            <span>{area.label}</span>
            <span className="tabular-nums text-white/60">{area.weight}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReadyPanel({ data, firstName, fromCache, flush }: { data: AICompatibilityDetail; firstName: string; fromCache: boolean; flush: boolean }) {
  const [showMeters, setShowMeters] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const metersId = useId();
  const howId = useId();

  const areas = availableAreaCount(data.breakdown);
  const early = areas <= EARLY_READ_MAX_AREAS;
  const dimensions = DIMENSION_ORDER.filter((key) => data.breakdown[key]?.available);
  const goalsAvailable = data.breakdown.relationshipGoals?.available;
  const sameGoals = data.shared.relationshipGoals;
  const hasShared =
    data.shared.interests.length + data.shared.values.length + data.shared.lifestyleTraits.length + sameGoals.length > 0;

  return (
    <Shell flush={flush}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-1.5 font-display text-base font-semibold text-white">
          <Heart className="size-4 fill-primary text-primary" aria-hidden />
          Why you two match
        </h3>
        <span className="text-xs text-white/60">{data.score}% overlap</span>
      </div>

      {early && (
        <p className="mt-2 text-xs leading-relaxed text-white/70">
          An early read — we only know a little about you both so far, so this will sharpen.
        </p>
      )}

      <AIReasons reasons={data.reasons} className="mt-3" />

      {(hasShared || goalsAvailable) && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-white/60">What you share</p>
          <ChipRow label="Interests" items={data.shared.interests} />
          <ChipRow label="Values" items={data.shared.values} />
          <ChipRow label="Lifestyle" items={data.shared.lifestyleTraits} />
          {sameGoals.length > 0 ? (
            <ChipRow label="You both want" items={sameGoals} />
          ) : (
            goalsAvailable && (
              <p className="text-xs leading-relaxed text-white/70">
                You&apos;re looking for different things — worth talking about.
              </p>
            )
          )}
        </div>
      )}

      <div className="mt-4">
        <ExplanationCard text={data.explanation} source={data.explanationSource} animate={!fromCache} />
      </div>

      {dimensions.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowMeters((v) => !v)}
            aria-expanded={showMeters}
            aria-controls={metersId}
            className="inline-flex min-h-8 items-center gap-1 rounded-md text-xs font-medium text-white/70 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-ring"
          >
            {showMeters ? "Hide where you overlap" : `See where you overlap with ${firstName}`}
            <motion.span animate={{ rotate: showMeters ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="size-3.5" aria-hidden />
            </motion.span>
          </button>

          <AnimatePresence initial={false}>
            {showMeters && (
              <motion.div
                id={metersId}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <ul className="divide-y divide-white/10 pt-2">
                  {dimensions.map((key) => (
                    <li key={key} className="flex items-center justify-between gap-4 py-2 text-xs">
                      <span className="text-white/80">{DIMENSION_LABELS[key]}</span>
                      <HeartMeter score={data.breakdown[key].score} label={DIMENSION_LABELS[key]} />
                    </li>
                  ))}
                </ul>
                <p className="pt-2 text-xs text-white/60">
                  Based on {areas} of 6 areas.{" "}
                  <button
                    type="button"
                    aria-expanded={showHow}
                    aria-controls={howId}
                    onClick={() => setShowHow((v) => !v)}
                    className="rounded-sm font-medium text-accent underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    How this works
                  </button>
                </p>
                {showHow && (
                  <div className="pt-2">
                    <OverlapNote id={howId} />
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </Shell>
  );
}

/**
 * "Why you two match" — the story behind a match: reasons first, what you share, the AI's explanation
 * (labelled), and the six areas as hearts on request. Handles every state the lookup can be in.
 */
export function WhyPanel({ state, firstName, onRetry, flush = false }: WhyPanelProps) {
  if (state.status === "idle" || state.status === "loading") {
    return (
      <Shell flush={flush}>
        <div className="flex items-center gap-2 text-xs text-white/70" role="status" aria-live="polite">
          <TypingHearts label="Sol is putting your explanation together" />
          Sol is putting your explanation together…
        </div>
        <Skeleton className="mt-3 h-3 w-full rounded-full" />
        <Skeleton className="mt-2 h-3 w-4/5 rounded-full" />
      </Shell>
    );
  }

  if (state.status === "unavailable") {
    return (
      <Shell flush={flush}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-white/70">
            <Heart className="mt-0.5 size-3.5 shrink-0 fill-primary text-primary" aria-hidden />
            {state.reason === "viewer_not_ready" ? (
              <span>Take the 10-minute conversation to see why you and {firstName} might match.</span>
            ) : (
              <span>You&apos;ll see why you two might click once {firstName} has finished their interview too.</span>
            )}
          </p>
          {state.reason === "viewer_not_ready" && (
            <Button asChild size="sm" className="rounded-full bg-gradient-brand text-white hover:opacity-90">
              <Link href="/ai-interview">Start with Sol</Link>
            </Button>
          )}
        </div>
      </Shell>
    );
  }

  if (state.status === "error") {
    return (
      <Shell flush={flush}>
        <div className="flex items-center justify-between gap-3 text-xs text-white/70">
          <span>Couldn&apos;t load the &ldquo;why&rdquo; right now.</span>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/15 px-3 py-1.5 text-white/80 outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RotateCw className="size-3" aria-hidden />
            Try again
          </button>
        </div>
      </Shell>
    );
  }

  return <ReadyPanel data={state.data} firstName={firstName} fromCache={state.fromCache} flush={flush} />;
}
