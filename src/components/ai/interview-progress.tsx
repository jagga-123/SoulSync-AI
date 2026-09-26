"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { HEART_PATH } from "@/components/brand/heart-path";
import type { InterviewProgress as Progress } from "@/types/api";

interface InterviewProgressProps {
  progress: Progress;
}

/**
 * A row of small hearts that fill as you answer — one per answer up to the point where the report unlocks
 * (15), so "Question 7 of about 15" is something you can see. Past that you can keep going for a sharper
 * read or finish whenever you like. Each new heart springs in (still under reduced motion).
 */
export function InterviewProgress({ progress }: InterviewProgressProps) {
  const { answered, min, max } = progress;
  const unlocked = answered >= min;
  const reduceMotion = useReducedMotion();

  // Only hearts that fill *after* the first render animate, so reloading a half-finished interview doesn't replay them all.
  const firstRender = useRef(true);
  useEffect(() => {
    firstRender.current = false;
  }, []);

  return (
    <div
      role="progressbar"
      aria-label="Interview progress"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={answered}
      aria-valuetext={unlocked ? `${answered} answered. Enough for a great read.` : `${answered} of about ${min} answered`}
      className="w-full"
    >
      <div aria-hidden className="flex items-center gap-[3px]">
        {Array.from({ length: min }, (_, i) => {
          const filled = i < answered;
          return (
            <svg key={i} viewBox="0 0 48 44" className="h-[13px] flex-1 max-w-4">
              <path d={HEART_PATH} fill="none" stroke="var(--foreground)" strokeOpacity={0.3} strokeWidth={3} strokeLinejoin="round" />
              {filled && (
                <motion.path
                  d={HEART_PATH}
                  fill="var(--primary)"
                  style={{ transformOrigin: "center", transformBox: "fill-box" }}
                  initial={firstRender.current || reduceMotion ? false : { scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 420, damping: 14 }}
                />
              )}
            </svg>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-white/70">
        {unlocked
          ? `${answered} answered — plenty for a great read`
          : `Question ${answered + 1} of about ${min}`}
      </p>
    </div>
  );
}
