"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion, useInView, animate } from "framer-motion";

interface CompatibilityRingProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  className?: string;
}

export function CompatibilityRing({
  value,
  size = 200,
  strokeWidth = 12,
  label = "Compatibility",
  className = "",
}: CompatibilityRingProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [display, setDisplay] = useState(0);
  // Multiple rings can render at once (e.g. a grid of match cards) — each
  // needs its own gradient id, or they'd collide on the same DOM id.
  const gradientId = `ring-gradient-${useId()}`;

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration: 1.6,
      delay: 0.2,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, value]);

  return (
    <div
      ref={ref}
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-white/8"
        />
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="55%" stopColor="var(--secondary)" />
            <stop offset="100%" stopColor="var(--accent)" />
          </linearGradient>
        </defs>
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{
            strokeDashoffset: inView
              ? circumference - (value / 100) * circumference
              : circumference,
          }}
          transition={{ duration: 1.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-4xl font-semibold text-white">
          {display}%
        </span>
        <span className="mt-1 text-xs font-medium uppercase tracking-wider text-white/45">
          {label}
        </span>
      </div>
    </div>
  );
}
