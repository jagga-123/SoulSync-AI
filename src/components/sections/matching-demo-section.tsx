"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { Check, Heart } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { Badge } from "@/components/ui/badge";
import { AvatarOrb } from "@/components/ui/avatar-orb";
import { HeartPulse } from "@/components/brand/heart-pulse";
import { OrbitParticles } from "@/components/effects/orbit-particles";
import { FadeIn } from "@/components/effects/reveal-text";
import {
  DEMO_INPUTS,
  DEMO_MATCH,
  DEMO_NOTICED,
  MATCHING_STAGES,
  MATCH_AREAS,
} from "@/lib/data";
import { TIER_SUBLINES } from "@/lib/ai-format";

gsap.registerPlugin(ScrollTrigger);

const STAGE_RANGES: [number, number][] = [
  [0, 0.22],
  [0.22, 0.48],
  [0.48, 0.74],
  [0.74, 1.001],
];

const STAGE_TRANSITION = { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const };

function StageListening() {
  return (
    <motion.div
      key="listening"
      initial={{ opacity: 0, scale: 0.85, filter: "blur(10px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
      transition={STAGE_TRANSITION}
      className="flex flex-col items-center gap-6"
    >
      <div className="relative flex size-32 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-primary/25 animate-pulse-ring" />
        <span className="absolute inset-3 rounded-full bg-secondary/25 animate-pulse-ring [animation-delay:0.6s]" />
        <OrbitParticles size={180} count={5} duration={10} colorClassName="bg-accent text-accent" />
        <HeartPulse className="relative size-16" />
      </div>
      <p className="text-sm font-medium text-white/80">
        {MATCHING_STAGES[0].caption}
      </p>
    </motion.div>
  );
}

/** One thing the demo "notices" — it fades in as the scroll moves through the stage. */
function NoticedLine({
  text,
  index,
  stageProgress,
}: {
  text: string;
  index: number;
  stageProgress: MotionValue<number>;
}) {
  const start = index * 0.25;
  const opacity = useTransform(stageProgress, [start, start + 0.2], [0, 1]);
  const x = useTransform(stageProgress, [start, start + 0.2], [-12, 0]);

  return (
    <motion.li style={{ opacity, x }} className="flex items-start gap-2.5 text-sm text-white/85">
      <Heart className="mt-0.5 size-4 shrink-0 fill-primary text-primary" aria-hidden />
      <span>
        <span className="text-white/60">Someone who </span>
        {text.charAt(0).toLowerCase() + text.slice(1)}
      </span>
    </motion.li>
  );
}

function StageNoticing({ stageProgress }: { stageProgress: MotionValue<number> }) {
  return (
    <motion.div
      key="noticing"
      initial={{ opacity: 0, scale: 0.92, filter: "blur(10px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 1.05, filter: "blur(10px)" }}
      transition={STAGE_TRANSITION}
      className="w-full max-w-sm space-y-5"
    >
      <p className="text-center text-sm font-medium text-white/80">{MATCHING_STAGES[1].caption}</p>
      <ul className="space-y-3">
        {DEMO_NOTICED.map((text, i) => (
          <NoticedLine key={text} text={text} index={i} stageProgress={stageProgress} />
        ))}
      </ul>
    </motion.div>
  );
}

/** One of the six areas being compared; it lights up as the scroll passes its turn. */
function AreaChip({
  label,
  index,
  stageProgress,
}: {
  label: string;
  index: number;
  stageProgress: MotionValue<number>;
}) {
  const start = index / MATCH_AREAS.length;
  const opacity = useTransform(stageProgress, [start, start + 0.12], [0.35, 1]);
  const scale = useTransform(stageProgress, [start, start + 0.12], [0.94, 1]);

  return (
    <motion.li
      style={{ opacity, scale }}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white"
    >
      <Check className="size-3.5 text-accent" aria-hidden />
      {label}
    </motion.li>
  );
}

function StageComparing({ stageProgress }: { stageProgress: MotionValue<number> }) {
  return (
    <motion.div
      key="comparing"
      initial={{ opacity: 0, scale: 0.92, filter: "blur(10px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 1.05, filter: "blur(10px)" }}
      transition={STAGE_TRANSITION}
      className="flex w-full max-w-md flex-col items-center gap-6"
    >
      <p className="text-sm font-medium text-white/80">{MATCHING_STAGES[2].caption}</p>
      <ul className="flex flex-wrap justify-center gap-2">
        {MATCH_AREAS.map((area, i) => (
          <AreaChip key={area.label} label={area.label} index={i} stageProgress={stageProgress} />
        ))}
      </ul>
    </motion.div>
  );
}

function StageMatch() {
  return (
    <motion.div
      key="introducing"
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
      <p className="text-sm text-white/60">{DEMO_MATCH.role}</p>

      <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-primary/70 bg-background/80 px-4 py-1.5 text-sm font-semibold text-white">
        <Heart className="size-4 fill-primary text-primary" aria-hidden />
        {DEMO_MATCH.label}
      </span>
      <p className="mt-2 text-sm text-white/70">{TIER_SUBLINES.exceptional}</p>

      <ul className="mt-5 space-y-2 text-left">
        {DEMO_MATCH.reasons.map((reason, i) => (
          <motion.li
            key={reason}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + i * 0.12, duration: 0.4 }}
            className="flex items-start gap-2 text-sm text-white/80"
          >
            <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            {reason}
          </motion.li>
        ))}
      </ul>

      <p className="mt-5 text-xs text-white/60">Example — not a real member.</p>
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
              <Heart className="size-3.5 fill-primary text-primary" />
              Example
            </Badge>
          </FadeIn>
          <FadeIn delay={0.1}>
            <h2 className="mt-4 text-balance font-display text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
              See how a match happens
            </h2>
          </FadeIn>
          <FadeIn delay={0.2}>
            <p className="mt-3 text-pretty text-sm leading-relaxed text-white/70 sm:text-base">
              Keep scrolling. Watch three example answers turn into an introduction, step by step.
            </p>
          </FadeIn>
        </div>

        <FadeIn delay={0.3} className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs text-white/60">Example answers:</span>
          {DEMO_INPUTS.map((input) => (
            <span
              key={input}
              className="glass rounded-full px-4 py-1.5 text-xs font-medium text-white/85"
            >
              {input}
            </span>
          ))}
        </FadeIn>

        <div className="flex min-h-[300px] w-full items-center justify-center">
          <AnimatePresence mode="wait">
            {stageIndex === 0 && <StageListening />}
            {stageIndex === 1 && <StageNoticing stageProgress={stageProgress} />}
            {stageIndex === 2 && <StageComparing stageProgress={stageProgress} />}
            {stageIndex === 3 && <StageMatch />}
          </AnimatePresence>
        </div>

        <div className="flex flex-col items-center gap-3">
          <p className="text-xs uppercase tracking-[0.25em] text-white/60">
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
