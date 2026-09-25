"use client";

import { motion, useReducedMotion } from "framer-motion";

import { HEART_PATH } from "@/components/brand/heart-path";

interface HeartPulseProps {
  /** Sizing/positioning classes, e.g. "size-16". */
  className?: string;
  /** Beat forever (loading states) or draw once and rest. */
  loop?: boolean;
}

/**
 * A heart that draws itself, fills in, then beats like a resting pulse (lub-dub, ~75 bpm) — the
 * product's stand-in for "the AI is thinking". Purely decorative: put it inside a labelled
 * `role="status"` region. With reduced motion it is simply a still heart.
 */
export function HeartPulse({ className = "size-16", loop = true }: HeartPulseProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.svg
      viewBox="0 0 48 44"
      aria-hidden="true"
      className={className}
      animate={reduceMotion || !loop ? undefined : { scale: [1, 1.08, 1, 1.05, 1] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", times: [0, 0.18, 0.36, 0.54, 1] }}
    >
      <motion.path
        d={HEART_PATH}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={2}
        strokeLinejoin="round"
        initial={{ pathLength: reduceMotion ? 1 : 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2, ease: "easeInOut" }}
      />
      <motion.path
        d={HEART_PATH}
        fill="var(--primary)"
        initial={{ opacity: reduceMotion ? 1 : 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: reduceMotion ? 0 : 1, duration: 0.6 }}
      />
    </motion.svg>
  );
}

/** Three tiny hearts that rise in turn — the "typing…" indicator. */
export function TypingHearts({ label = "The AI is typing" }: { label?: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <span role="status" aria-label={label} className="inline-flex items-end gap-1">
      {[0, 1, 2].map((i) => (
        <motion.svg
          key={i}
          width="10"
          height="9"
          viewBox="0 0 48 44"
          aria-hidden="true"
          animate={reduceMotion ? { opacity: 0.7 } : { y: [0, -4, 0], opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        >
          <path d={HEART_PATH} fill="var(--primary)" />
        </motion.svg>
      ))}
    </span>
  );
}
