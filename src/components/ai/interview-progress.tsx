"use client";

import { motion } from "framer-motion";
import type { InterviewProgress as Progress } from "@/types/api";

interface InterviewProgressProps {
  progress: Progress;
}

/** Progress toward the 25-answer maximum, with a marker where the report
 * unlocks (15 answers) — so it's clear the interview can be finished early. */
export function InterviewProgress({ progress }: InterviewProgressProps) {
  const { answered, min, max, percent } = progress;
  const minMarker = (min / max) * 100;
  const unlocked = answered >= min;

  return (
    <div className="w-full">
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary via-secondary to-accent"
          initial={false}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
        <span
          aria-hidden
          className="absolute top-0 h-full w-px bg-white/40"
          style={{ left: `${minMarker}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs text-white/60">
        <span>
          {answered} of up to {max} answered
        </span>
        <span className={unlocked ? "text-accent" : undefined}>
          {unlocked ? "Report unlocked — keep going for a sharper read" : `${min - answered} more to unlock your report`}
        </span>
      </div>
    </div>
  );
}
