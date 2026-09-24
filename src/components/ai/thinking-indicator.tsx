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

interface ThinkingIndicatorProps {
  phrases?: string[];
}

/** The AI's "thinking" state: pulsing avatar, animated dots, and a status
 * line that cycles so a slow response still feels alive. */
export function ThinkingIndicator({ phrases = DEFAULT_PHRASES }: ThinkingIndicatorProps) {
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
        <span aria-hidden>
          <TypingHearts />
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
