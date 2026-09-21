"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, RotateCw, Sparkles } from "lucide-react";

import { AIReasons } from "@/components/ai/ai-match-pill";
import { StreamingText } from "@/components/ai/streaming-text";
import { Skeleton } from "@/components/ui/skeleton";
import { DIMENSION_LABELS, TIER_LABELS, TIER_STYLES } from "@/lib/ai-format";
import type { AICompatibilityState } from "@/hooks/use-ai-compatibility";
import type { CompatibilityDimension } from "@/types/api";

interface MatchAIInsightsProps {
  state: AICompatibilityState;
  firstName: string;
  onRetry: () => void;
}

const DIMENSION_ORDER: CompatibilityDimension[] = [
  "values",
  "interests",
  "communication",
  "lifestyle",
  "relationshipGoals",
  "personality",
];

function InsightShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-6 mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">{children}</div>
  );
}

export function MatchAIInsights({ state, firstName, onRetry }: MatchAIInsightsProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  if (state.status === "idle" || state.status === "loading") {
    return (
      <InsightShell>
        <div className="flex items-center gap-2 text-xs text-white/50" role="status" aria-live="polite">
          <Sparkles className="size-3.5 animate-pulse text-accent" aria-hidden />
          SoulSync AI is analysing your match…
        </div>
        <Skeleton className="mt-3 h-3 w-full rounded-full" />
        <Skeleton className="mt-2 h-3 w-4/5 rounded-full" />
      </InsightShell>
    );
  }

  if (state.status === "unavailable") {
    return (
      <InsightShell>
        <p className="flex items-start gap-2 text-xs leading-relaxed text-white/55">
          <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
          {state.reason === "viewer_not_ready" ? (
            <span>
              Take the{" "}
              <Link href="/ai-interview" className="font-medium text-accent underline-offset-2 hover:underline">
                AI interview
              </Link>{" "}
              to see how compatible you are with {firstName}.
            </span>
          ) : (
            <span>AI insights unlock once {firstName} completes their AI interview.</span>
          )}
        </p>
      </InsightShell>
    );
  }

  if (state.status === "error") {
    return (
      <InsightShell>
        <div className="flex items-center justify-between gap-3 text-xs text-white/55">
          <span>{state.message}</span>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/15 px-2.5 py-1 text-white/70 transition-colors hover:bg-white/8"
          >
            <RotateCw className="size-3" aria-hidden />
            Retry
          </button>
        </div>
      </InsightShell>
    );
  }

  const { data, fromCache } = state;
  const dimensions = DIMENSION_ORDER.filter((key) => data.breakdown[key]?.available);

  return (
    <InsightShell>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-white/50">
          <Sparkles className="size-3.5 text-accent" aria-hidden />
          AI insights
        </span>
        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${TIER_STYLES[data.tier]}`}>
          {TIER_LABELS[data.tier]}
        </span>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-white/80">
        <StreamingText text={data.explanation} animate={!fromCache} />
      </p>

      {data.reasons.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/35">Why you match</p>
          <AIReasons reasons={data.reasons} />
        </div>
      )}

      {dimensions.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowBreakdown((v) => !v)}
            aria-expanded={showBreakdown}
            className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-white/50 transition-colors hover:text-white"
          >
            {showBreakdown ? "Hide breakdown" : "See breakdown"}
            <motion.span animate={{ rotate: showBreakdown ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="size-3.5" aria-hidden />
            </motion.span>
          </button>

          <AnimatePresence initial={false}>
            {showBreakdown && (
              <motion.ul
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="space-y-2.5 pt-3">
                  {dimensions.map((key) => {
                    const dimension = data.breakdown[key];
                    return (
                      <li key={key}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-white/65">{DIMENSION_LABELS[key]}</span>
                          <span className="tabular-nums text-white/45">{dimension.score}%</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/8">
                          <motion.div
                            className="h-full rounded-full bg-gradient-to-r from-primary via-secondary to-accent"
                            initial={{ width: 0 }}
                            animate={{ width: `${dimension.score}%` }}
                            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </div>
              </motion.ul>
            )}
          </AnimatePresence>
        </>
      )}
    </InsightShell>
  );
}
