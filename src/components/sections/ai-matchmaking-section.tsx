"use client";

import { motion } from "framer-motion";
import { Heart, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { AvatarOrb } from "@/components/ui/avatar-orb";
import { CompatibilityRing } from "@/components/effects/compatibility-ring";
import { RevealText, FadeIn } from "@/components/effects/reveal-text";
import { ScrollZoom } from "@/components/effects/scroll-zoom";
import { PERSONALITY_TRAITS } from "@/lib/data";

function TraitBar({
  label,
  value,
  description,
  index,
}: {
  label: string;
  value: number;
  description: string;
  index: number;
}) {
  return (
    <FadeIn delay={index * 0.1} className="group">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-white">{label}</p>
        <span className="font-display text-sm font-semibold text-accent">
          {value}%
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/8">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary via-secondary to-accent"
          initial={{ width: 0 }}
          whileInView={{ width: `${value}%` }}
          viewport={{ once: true, amount: 0.8 }}
          transition={{ duration: 1.1, delay: index * 0.1, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-white/45">
        {description}
      </p>
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
                <Sparkles className="size-3.5 text-accent" />
                AI Matchmaking
              </Badge>
            </FadeIn>

            <RevealText
              as="h2"
              text="Matched by conversation, not chance"
              className="mt-5 text-balance font-display text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl"
              stagger={0.04}
            />

            <FadeIn delay={0.2}>
              <p className="mt-5 max-w-lg text-pretty leading-relaxed text-white/60">
                Our AI doesn&apos;t just read a bio. It listens to how you
                talk about your life, your values, and what you&apos;re
                looking for, then maps you across dimensions that actually
                predict compatibility.
              </p>
            </FadeIn>

            <div className="mt-10 space-y-7">
              {PERSONALITY_TRAITS.map((trait, index) => (
                <TraitBar key={trait.label} index={index} {...trait} />
              ))}
            </div>
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

              <div className="relative mt-10 flex justify-center">
                <CompatibilityRing value={94} size={188} strokeWidth={11} />
              </div>

              <div className="relative mt-8 flex flex-wrap justify-center gap-2">
                {["Shared humor", "Same love language", "Aligned ambitions"].map(
                  (tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70"
                    >
                      {tag}
                    </span>
                  ),
                )}
              </div>
            </div>
          </ScrollZoom>
        </div>
      </div>
    </section>
  );
}
