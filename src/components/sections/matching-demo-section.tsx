"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { Brain, Sparkles } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { Badge } from "@/components/ui/badge";
import { AvatarOrb } from "@/components/ui/avatar-orb";
import { OrbitParticles } from "@/components/effects/orbit-particles";
import { FadeIn } from "@/components/effects/reveal-text";
import { DEMO_INPUTS, DEMO_TRAITS, DEMO_MATCH, MATCHING_STAGES } from "@/lib/data";

gsap.registerPlugin(ScrollTrigger);

const STAGE_RANGES: [number, number][] = [
  [0, 0.22],
  [0.22, 0.48],
  [0.48, 0.74],
  [0.74, 1.001],
];

const STAGE_TRANSITION = { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const };

function StageThinking() {
  return (
    <motion.div
      key="thinking"
      initial={{ opacity: 0, scale: 0.85, filter: "blur(10px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
      transition={STAGE_TRANSITION}
      className="flex flex-col items-center gap-6"
    >
      <div className="relative flex size-32 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-primary/30 animate-pulse-ring" />
        <span className="absolute inset-3 rounded-full bg-secondary/30 animate-pulse-ring [animation-delay:0.6s]" />
        <OrbitParticles size={180} count={5} duration={10} colorClassName="bg-accent text-accent" />
        <span className="relative flex size-20 items-center justify-center rounded-full bg-gradient-brand animate-brain-pulse">
          <Brain className="size-9 text-white" />
        </span>
      </div>
      <p className="text-sm font-medium text-white/70">
        Reading your answers
        <span className="animate-caret-blink">&hellip;</span>
      </p>
    </motion.div>
  );
}

function DemoTraitBar({
  trait,
  index,
  stageProgress,
}: {
  trait: { label: string; value: number; description: string };
  index: number;
  stageProgress: MotionValue<number>;
}) {
  const start = index * 0.18;
  const width = useTransform(stageProgress, (v) => {
    const local = Math.min(1, Math.max(0, (v - start) / (1 - start)));
    return `${local * trait.value}%`;
  });

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-white">{trait.label}</p>
        <span className="font-display text-sm font-semibold text-accent">
          {trait.value}%
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/8">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary via-secondary to-accent"
          style={{ width }}
        />
      </div>
    </div>
  );
}

function StageAnalysis({ stageProgress }: { stageProgress: MotionValue<number> }) {
  return (
    <motion.div
      key="analysis"
      initial={{ opacity: 0, scale: 0.92, filter: "blur(10px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 1.05, filter: "blur(10px)" }}
      transition={STAGE_TRANSITION}
      className="w-full max-w-sm space-y-5"
    >
      <p className="text-center text-sm font-medium text-white/70">
        Mapping your personality&hellip;
      </p>
      {DEMO_TRAITS.map((trait, i) => (
        <DemoTraitBar key={trait.label} trait={trait} index={i} stageProgress={stageProgress} />
      ))}
    </motion.div>
  );
}

function DemoCompatibilityRing({
  stageProgress,
  value = 94,
}: {
  stageProgress: MotionValue<number>;
  value?: number;
}) {
  const size = 176;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const dashoffset = useTransform(
    stageProgress,
    (v) => circumference - Math.min(1, v) * (value / 100) * circumference,
  );
  const [display, setDisplay] = useState(0);

  useMotionValueEvent(stageProgress, "change", (v) => {
    setDisplay(Math.round(Math.min(1, v) * value));
  });

  return (
    <div
      className="relative inline-flex items-center justify-center"
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
          <linearGradient id="demo-ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
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
          stroke="url(#demo-ring-gradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{ strokeDashoffset: dashoffset }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-3xl font-semibold text-white">{display}%</span>
        <span className="mt-1 text-[10px] font-medium uppercase tracking-wider text-white/45">
          Compatibility
        </span>
      </div>
    </div>
  );
}

function StageCalculation({ stageProgress }: { stageProgress: MotionValue<number> }) {
  return (
    <motion.div
      key="calculation"
      initial={{ opacity: 0, scale: 0.92, filter: "blur(10px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 1.05, filter: "blur(10px)" }}
      transition={STAGE_TRANSITION}
      className="flex flex-col items-center gap-6"
    >
      <div className="relative overflow-hidden rounded-full">
        <div className="pointer-events-none absolute inset-x-0 h-8 bg-gradient-to-b from-transparent via-accent/50 to-transparent animate-scan-line" />
        <DemoCompatibilityRing stageProgress={stageProgress} value={DEMO_MATCH.match} />
      </div>
      <p className="text-sm font-medium text-white/70">Scanning for alignment&hellip;</p>
    </motion.div>
  );
}

function StageMatch() {
  return (
    <motion.div
      key="match"
      initial={{ opacity: 0, scale: 0.8, filter: "blur(12px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 0.9, filter: "blur(8px)" }}
      transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
      className="glass-strong glow-primary relative w-full max-w-sm rounded-3xl p-7 text-center"
    >
      <div className="absolute -inset-6 -z-10 rounded-[40px] bg-gradient-brand opacity-20 blur-3xl" />

      <AvatarOrb
        initials={DEMO_MATCH.initials}
        gradient={DEMO_MATCH.gradient}
        className="mx-auto size-20 text-2xl"
      />
      <p className="mt-4 font-display text-xl font-semibold text-white">
        {DEMO_MATCH.name}, {DEMO_MATCH.age}
      </p>
      <p className="text-sm text-white/50">{DEMO_MATCH.role}</p>
      <p className="mt-3 font-display text-3xl font-semibold text-accent">
        {DEMO_MATCH.match}% Match
      </p>

      <ul className="mt-5 space-y-2 text-left">
        {DEMO_MATCH.reasons.map((reason, i) => (
          <motion.li
            key={reason}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + i * 0.12, duration: 0.4 }}
            className="flex items-start gap-2 text-sm text-white/70"
          >
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent" />
            {reason}
          </motion.li>
        ))}
      </ul>
    </motion.div>
  );
}

export function MatchingDemoSection() {
  const wrapRef = useRef<HTMLElement>(null);
  const [stageIndex, setStageIndex] = useState(0);
  const stageProgress = useMotionValue(0);

  useEffect(() => {
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: wrapRef.current,
        start: "top top",
        end: "bottom bottom",
        scrub: 0.4,
        onUpdate: (self) => {
          const p = self.progress;

          let idx = STAGE_RANGES.findIndex(([s, e]) => p >= s && p < e);
          if (idx === -1) idx = p >= 1 ? 3 : 0;
          setStageIndex(idx);

          const [s, e] = STAGE_RANGES[idx];
          const local = Math.min(1, Math.max(0, (p - s) / (e - s)));
          stageProgress.set(local);
        },
      });
    }, wrapRef);

    return () => ctx.revert();
  }, [stageProgress]);

  return (
    <section
      id="matching-demo"
      ref={wrapRef}
      className="relative"
      style={{ height: "320vh" }}
    >
      <div className="sticky top-0 flex h-screen flex-col items-center justify-center gap-7 overflow-hidden px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-xl text-center">
          <FadeIn className="flex justify-center">
            <Badge className="glass gap-1.5 rounded-full border-white/15 px-4 py-1.5 text-xs font-medium text-white/80">
              <Sparkles className="size-3.5 text-accent" />
              Live demo
            </Badge>
          </FadeIn>
          <FadeIn delay={0.1}>
            <h2 className="mt-4 text-balance font-display text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
              See AI matching in action
            </h2>
          </FadeIn>
          <FadeIn delay={0.2}>
            <p className="mt-3 text-pretty text-sm leading-relaxed text-white/55 sm:text-base">
              Keep scrolling. Watch three honest answers turn into a real
              match, step by step.
            </p>
          </FadeIn>
        </div>

        <FadeIn delay={0.3} className="flex flex-wrap items-center justify-center gap-2">
          {DEMO_INPUTS.map((input) => (
            <span
              key={input}
              className="glass rounded-full px-4 py-1.5 text-xs font-medium text-white/80"
            >
              {input}
            </span>
          ))}
        </FadeIn>

        <div className="flex min-h-[300px] w-full items-center justify-center">
          <AnimatePresence mode="wait">
            {stageIndex === 0 && <StageThinking />}
            {stageIndex === 1 && <StageAnalysis stageProgress={stageProgress} />}
            {stageIndex === 2 && <StageCalculation stageProgress={stageProgress} />}
            {stageIndex === 3 && <StageMatch />}
          </AnimatePresence>
        </div>

        <div className="flex flex-col items-center gap-3">
          <p className="text-xs uppercase tracking-[0.25em] text-white/40">
            {MATCHING_STAGES[stageIndex].label}
          </p>
          <div className="flex items-center gap-2">
            {MATCHING_STAGES.map((stage, i) => (
              <span
                key={stage.key}
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  i === stageIndex ? "w-8 bg-gradient-brand" : "w-1.5 bg-white/15"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
