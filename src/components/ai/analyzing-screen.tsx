"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { HeartPulse } from "@/components/brand/heart-pulse";

/** What the pipeline really does, in order. Each holds for CAPTION_MS; the last one holds until the result lands. */
const CAPTIONS = [
  "Reading everything you shared…",
  "Noticing what matters to you…",
  "Hearing how you communicate…",
  "Sketching your personality…",
  "Writing your report — just for you.",
];

const CAPTION_MS = 2400;
const SLOW_AFTER_MS = 12_000;

/** Two threads (rose and plum) that sway and slowly weave toward the heart — one step closer per caption, never touching until the report is ready. */
const THREADS = [
  { colour: "var(--primary)", a: "M0 80 C50 20 70 200 120 124", b: "M0 80 C40 140 90 40 120 124", duration: 7 },
  { colour: "var(--secondary)", a: "M240 160 C190 220 170 40 120 116", b: "M240 160 C200 100 150 200 120 116", duration: 8.5 },
];

/** Six small apricot dots on slow orbits around the heart. */
const ORBITS = [
  { radius: 62, size: 5, seconds: 16, opacity: 0.8 },
  { radius: 78, size: 4, seconds: 22, opacity: 0.6 },
  { radius: 92, size: 6, seconds: 28, opacity: 0.7 },
  { radius: 70, size: 4, seconds: 19, opacity: 0.5 },
  { radius: 100, size: 5, seconds: 34, opacity: 0.6 },
  { radius: 85, size: 3, seconds: 25, opacity: 0.8 },
];

/**
 * Full-panel state shown while the interview is being analysed ("Two threads", docs/redesign/02 §4.4). The wait is
 * real and variable, so there is no percentage: a resting-pulse heart, threads that draw closer, and honest captions.
 * The drawing is decoration (`aria-hidden`); only the caption is announced. Reduced motion gets the still version.
 */
export function AnalyzingScreen() {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => Math.min(i + 1, CAPTIONS.length - 1)), CAPTION_MS);
    const slowTimer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => {
      clearInterval(timer);
      clearTimeout(slowTimer);
    };
  }, []);

  // How far each thread has travelled toward the heart: a little more with every caption, never all the way.
  const reach = 0.5 + index * 0.09;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      // The bloom: as the result arrives the whole picture swells and dissolves into the report.
      exit={{ opacity: 0, scale: reduceMotion ? 1 : 1.1 }}
      transition={{ duration: 0.45 }}
      className="mx-auto flex w-full max-w-md flex-col items-center gap-5 rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-8 text-center sm:py-10"
    >
      <div aria-hidden className="relative size-52 sm:size-60">
        <div className="absolute left-1/2 top-1/2 size-60 -translate-x-1/2 -translate-y-1/2 scale-[0.87] sm:scale-100">
          <svg viewBox="0 0 240 240" className="absolute inset-0 size-full overflow-visible">
            {THREADS.map((thread) => (
              <motion.path
                key={thread.colour}
                d={thread.a}
                fill="none"
                stroke={thread.colour}
                strokeWidth={2.5}
                strokeLinecap="round"
                opacity={0.9}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: reach, d: reduceMotion ? thread.a : [thread.a, thread.b, thread.a] }}
                transition={{
                  pathLength: { duration: reduceMotion ? 0 : 1.4, ease: "easeOut" },
                  d: { duration: thread.duration, repeat: Infinity, ease: "easeInOut" },
                }}
              />
            ))}
          </svg>

          {ORBITS.map((orbit, i) => (
            <motion.div
              key={i}
              className="absolute left-1/2 top-1/2 size-0"
              initial={{ rotate: i * 60 }}
              animate={{ rotate: reduceMotion ? i * 60 : [i * 60, i * 60 + (i % 2 === 0 ? 360 : -360)] }}
              transition={{ duration: orbit.seconds, repeat: Infinity, ease: "linear" }}
            >
              <span
                className="absolute rounded-full bg-accent"
                style={{ width: orbit.size, height: orbit.size, left: orbit.radius, top: -orbit.size / 2, opacity: orbit.opacity }}
              />
            </motion.div>
          ))}

          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <HeartPulse className="size-[72px]" />
          </div>
        </div>
      </div>

      <div>
        <h2 className="font-display text-xl font-semibold text-white">Reading what you shared</h2>
        <p className="mt-1.5 text-sm text-white/70">This only takes a moment.</p>
      </div>

      <div role="status" aria-live="polite" className="min-h-10">
        <motion.p
          key={index}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="text-sm text-white/85"
        >
          {CAPTIONS[index]}
        </motion.p>
        {slow && <p className="mt-1 text-xs text-white/60">Still working — good things take a moment.</p>}
      </div>
    </motion.div>
  );
}
