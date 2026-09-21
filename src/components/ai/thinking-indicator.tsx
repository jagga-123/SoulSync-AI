"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AIAvatar } from "@/components/ai/ai-avatar";

const DEFAULT_PHRASES = [
  "Reading your answer",
  "Thinking about what to ask next",
  "Finding the right question",
];

interface ThinkingIndicatorProps {
  phrases?: string[];
}

/** The AI's "thinking" state: pulsing avatar, animated dots, and a status
 * line that cycles so a slow response still feels alive. */
export function ThinkingIndicator({ phrases = DEFAULT_PHRASES }: ThinkingIndicatorProps) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (phrases.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % phrases.length), 1800);
    return () => clearInterval(timer);
  }, [phrases.length]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.25 }}
      className="flex items-end gap-2.5"
      role="status"
      aria-live="polite"
    >
      <AIAvatar active />
      <div className="glass flex items-center gap-3 rounded-2xl rounded-bl-md px-4 py-3">
        <span className="flex gap-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="size-1.5 rounded-full bg-accent"
              animate={reduceMotion ? undefined : { y: [0, -4, 0], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.16, ease: "easeInOut" }}
            />
          ))}
        </span>
        <AnimatePresence mode="wait">
          <motion.span
            key={index}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="text-xs text-white/55"
          >
            {phrases[index]}…
          </motion.span>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
