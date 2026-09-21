"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

interface StreamingTextProps {
  text: string;
  /** Reveal progressively. When false (or the user prefers reduced motion) the
   * full text is shown immediately. */
  animate: boolean;
  className?: string;
  /** Fires on every reveal step — lets a scroll container follow the text. */
  onProgress?: () => void;
  onDone?: () => void;
}

// Reveals the text a word at a time, at a pace that reads like a model
// streaming tokens: ~55ms per word, never shorter than 0.6s or longer than 3.2s
// so a long answer doesn't make the user wait.
const MS_PER_TOKEN = 55;
const MIN_DURATION_MS = 600;
const MAX_DURATION_MS = 3200;

export function StreamingText({ text, animate, className, onProgress, onDone }: StreamingTextProps) {
  const reduceMotion = useReducedMotion();
  const shouldAnimate = animate && !reduceMotion;

  const tokens = text.match(/\S+\s*/g) ?? [text];
  const [revealed, setRevealed] = useState(shouldAnimate ? 0 : tokens.length);

  // Keep the latest callbacks without restarting the animation when a parent
  // re-renders with new function identities.
  const onProgressRef = useRef(onProgress);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onProgressRef.current = onProgress;
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    const parts = text.match(/\S+\s*/g) ?? [text];

    if (!shouldAnimate) {
      setRevealed(parts.length);
      return;
    }

    setRevealed(0);
    const duration = Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, parts.length * MS_PER_TOKEN));
    const startedAt = performance.now();
    let frame = 0;
    let finished = false;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      setRevealed(Math.floor(progress * parts.length));
      onProgressRef.current?.();

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else if (!finished) {
        finished = true;
        setRevealed(parts.length);
        onDoneRef.current?.();
      }
    };
    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [text, shouldAnimate]);

  const streaming = revealed < tokens.length;

  return (
    <span className={className}>
      {/* Screen readers get the whole message at once, not word-by-word. */}
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {tokens.slice(0, revealed).join("")}
        {streaming && (
          <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.15em] animate-caret-blink rounded-full bg-accent" />
        )}
      </span>
    </span>
  );
}
