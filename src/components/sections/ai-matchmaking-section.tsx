"use client";

import { motion } from "framer-motion";
import { Check, Heart } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { AvatarOrb } from "@/components/ui/avatar-orb";
import { RevealText, FadeIn } from "@/components/effects/reveal-text";
import { ScrollZoom } from "@/components/effects/scroll-zoom";
import { MATCH_AREAS } from "@/lib/data";
import { TIER_LABELS, TIER_SUBLINES } from "@/lib/ai-format";

/** The heaviest area counts for 25 % — bars are scaled to it so the biggest fills the track. */
const MAX_WEIGHT = Math.max(...MATCH_AREAS.map((area) => area.weight));

const EXAMPLE_REASONS = [
  "You both value honesty and personal growth",
  "You both enjoy hiking, cooking and travel",
  "Your communication styles complement each other",
];

function AreaBar({
  label,
  weight,
  description,
  index,
}: {
  label: string;
  weight: number;
  description: string;
  index: number;
}) {
  return (
    <FadeIn delay={index * 0.08} className="group">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-white">{label}</p>
        <span className="text-sm font-semibold tabular-nums text-accent">
          {weight}%
          <span className="sr-only"> of the overall read</span>
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/8">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary via-secondary to-accent"
          initial={{ width: 0 }}
          whileInView={{ width: `${(weight / MAX_WEIGHT) * 100}%` }}
          viewport={{ once: true, amount: 0.8 }}
          transition={{ duration: 1.1, delay: index * 0.08, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-white/60">{description}</p>
    </FadeIn>
  );
}

export function AIMatchmakingSection() {
  return (
    <section id="matchmaking" className="relative py-28 sm:py-36">
      <div className="mx-auto max-w-8xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2 lg:gap-12">
          <div>
            <FadeIn>
              <Badge className="glass gap-1.5 rounded-full border-white/15 px-4 py-1.5 text-xs font-medium text-white/80">
                <Heart className="size-3.5 fill-primary text-primary" />
                How we match
              </Badge>
            </FadeIn>

            <RevealText
              as="h2"
              text="Not a score. A reason."
              className="mt-5 text-balance font-display text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl"
              stagger={0.04}
            />

            <FadeIn delay={0.2}>
              <p className="mt-5 max-w-lg text-pretty leading-relaxed text-white/70">
                Most apps give you a number and expect you to trust it. We compare six things about you and
                the person you&apos;re looking at — then tell you, in plain words, what you actually have in
                common.
              </p>
            </FadeIn>

            <p className="mt-8 text-sm font-medium text-white/80">
              The six things we compare — and how much each one counts
            </p>
            <div className="mt-5 space-y-6">
              {MATCH_AREAS.map((area, index) => (
                <AreaBar key={area.label} index={index} {...area} />
              ))}
            </div>
            <p className="mt-6 max-w-lg text-xs leading-relaxed text-white/60">
              Values count the most, personality the least. The AI can be wrong — you decide who to talk to.
            </p>
          </div>

          <ScrollZoom className="relative" from={0.82} to={1}>
            <div className="glass-strong glow-primary relative overflow-hidden rounded-3xl p-8 sm:p-10">
              <div className="absolute -right-16 -top-16 size-56 rounded-full bg-secondary/25 blur-3xl" />
              <div className="absolute -bottom-16 -left-16 size-56 rounded-full bg-primary/20 blur-3xl" />

              <div className="relative flex items-center justify-center gap-6">
                <AvatarOrb
                  initials="Y"
                  gradient="from-secondary to-primary"
                  className="size-16 text-xl sm:size-20"
                />

                <div className="relative flex h-px flex-1 items-center bg-gradient-to-r from-secondary/60 via-white/20 to-primary/60">
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <span className="absolute inset-0 rounded-full bg-primary/40 animate-pulse-ring" />
                    <span className="relative flex size-9 items-center justify-center rounded-full bg-background ring-1 ring-white/15">
                      <Heart className="size-4 fill-primary text-primary" />
                    </span>
                  </div>
                </div>

                <AvatarOrb
                  initials="A"
                  gradient="from-primary to-accent"
                  className="size-16 text-xl sm:size-20"
                />
              </div>

              <div className="relative mt-9 flex flex-col items-center gap-2 text-center">
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/70 bg-background/80 px-4 py-1.5 text-sm font-semibold text-white">
                  <Heart className="size-4 fill-primary text-primary" aria-hidden />
                  {TIER_LABELS.exceptional}
                </span>
                <p className="text-sm text-white/70">{TIER_SUBLINES.exceptional}</p>
              </div>

              <ul className="relative mt-6 space-y-2.5 text-left">
                {EXAMPLE_REASONS.map((reason) => (
                  <li key={reason} className="flex items-start gap-2.5 text-sm text-white/80">
                    <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                    {reason}
                  </li>
                ))}
              </ul>

              <p className="relative mt-7 text-center text-xs text-white/60">Example — not real members.</p>
            </div>
          </ScrollZoom>
        </div>
      </div>
    </section>
  );
}
