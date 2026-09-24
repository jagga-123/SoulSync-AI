"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { HeartPulse } from "@/components/brand/heart-pulse";

const STEPS = [
  "Reading everything you shared",
  "Noticing what matters to you",
  "Hearing how you communicate",
  "Sketching your personality",
  "Writing your report — just for you",
];

const STEP_MS = 1100;

/** Full-panel state shown while the interview is being analysed. Steps tick
 * forward on a timer; the last one keeps spinning until the response lands. */
export function AnalyzingScreen() {
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setActive((i) => Math.min(i + 1, STEPS.length - 1)), STEP_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="glass-strong mx-auto flex w-full max-w-md flex-col items-center gap-6 rounded-3xl px-6 py-10 text-center"
      role="status"
      aria-live="polite"
    >
      <HeartPulse className="size-16" />
      <div>
        <h2 className="font-display text-xl font-semibold text-white">Reading what you shared</h2>
        <p className="mt-1.5 text-sm text-white/55">This only takes a moment.</p>
      </div>

      <ul className="w-full space-y-2.5 text-left">
        {STEPS.map((step, index) => {
          const done = index < active;
          const current = index === active;
          return (
            <motion.li
              key={step}
              initial={reduceMotion ? false : { opacity: 0, x: -8 }}
              animate={{ opacity: done || current ? 1 : 0.35, x: 0 }}
              transition={{ duration: 0.3, delay: reduceMotion ? 0 : index * 0.08 }}
              className="flex items-center gap-3 text-sm"
            >
              <span
                className={`flex size-5 shrink-0 items-center justify-center rounded-full ${
                  done ? "bg-accent/20 text-accent" : "bg-white/8 text-white/50"
                }`}
              >
                {done ? (
                  <Check className="size-3" />
                ) : current ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : null}
              </span>
              <span className={done || current ? "text-white/85" : "text-white/60"}>{step}</span>
            </motion.li>
          );
        })}
      </ul>
    </motion.div>
  );
}
