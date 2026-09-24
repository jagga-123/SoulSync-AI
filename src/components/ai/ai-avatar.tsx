"use client";

import { motion, useReducedMotion } from "framer-motion";
import { MessageCircleHeart } from "lucide-react";

interface AIAvatarProps {
  /** Adds a slow "alive" glow — used while the AI is speaking or thinking. */
  active?: boolean;
  className?: string;
}

export function AIAvatar({ active = false, className = "size-9" }: AIAvatarProps) {
  const reduceMotion = useReducedMotion();

  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center ${className}`}>
      {active && !reduceMotion && (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full bg-gradient-brand"
          animate={{ scale: [1, 1.5, 1], opacity: [0.45, 0, 0.45] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <span className="relative flex size-full items-center justify-center rounded-full bg-gradient-brand shadow-lg shadow-primary/25 ring-1 ring-white/20">
        <MessageCircleHeart className="size-[50%] text-white" aria-hidden />
      </span>
    </span>
  );
}
