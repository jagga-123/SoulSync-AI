"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AIAvatar } from "@/components/ai/ai-avatar";
import { TypingHearts } from "@/components/brand/heart-pulse";

const DEFAULT_PHRASES = [
  "Reading your answer",
  "Thinking about what to ask next",
  "Finding the right question",
];

/** After this long with no reply, say so kindly — never an error, just honesty about the wait. */
const SLOW_AFTER_MS = 8000;

interface ThinkingIndicatorProps {
  phrases?: string[];
}

/** Sol's "writing" state: a glowing avatar, three little hearts, and a status line that cycles so a slow
 * response still feels alive (and says so after 8 seconds). */
export function ThinkingIndicator({ phrases = DEFAULT_PHRASES }: ThinkingIndicatorProps) {
  const [index, setIndex] = useState(0);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (phrases.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % phrases.length), 1800);
    return () => clearInterval(timer);
  }, [phrases.length]);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

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
        <span aria-hidden>
          <TypingHearts label="Sol is writing" />
        </span>
        <AnimatePresence mode="wait">
          <motion.span
            key={slow ? "slow" : index}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="text-xs text-white/70"
          >
            {slow ? "Sol is taking a little longer…" : `${phrases[index]}…`}
          </motion.span>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
