"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, Heart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/sections/section-heading";
import { MATCH_AREAS, SHOWCASE } from "@/lib/data";
import { cn } from "@/lib/utils";

/** The heaviest area counts for 25 % — bars are scaled to it so the biggest fills the track. */
const MAX_WEIGHT = Math.max(...MATCH_AREAS.map((area) => area.weight));

function HeartMeter({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Heart
          key={i}
          aria-hidden
          className={cn("size-4", i < value ? "fill-primary text-primary" : "text-white/25")}
        />
      ))}
      <span className="sr-only">{value} out of 5</span>
    </span>
  );
}

/**
 * "Not a score. A reason." — the left column says what's compared and how much each thing counts (the real
 * weights); the right card shows one made-up pair, with the reasons up front and the detail behind a button.
 */
export function AIMatchmakingSection() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const [a, b] = SHOWCASE.people;

  return (
    <section id="matchmaking" aria-labelledby="matchmaking-title" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-8xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-start gap-14 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading id="matchmaking-title" eyebrow="How we match" title="Not a score. A reason." align="left">
              <p>
                Most apps give you a number and expect you to trust it. We compare six things about you and
                the person you&apos;re looking at — then tell you, in plain words, what you actually have in
                common.
              </p>
            </SectionHeading>

            <p className="mt-10 text-sm font-medium text-white/80">
              The six things we compare — and how much each one counts
            </p>
            <ul className="mt-5 space-y-6">
              {MATCH_AREAS.map((area) => (
                <li key={area.label}>
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm font-medium text-white">{area.label}</p>
                    <span className="text-sm font-semibold tabular-nums text-accent">
                      {area.weight}%<span className="sr-only"> of the overall read</span>
                    </span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="reveal-bar h-full rounded-full bg-gradient-to-r from-primary via-secondary to-accent"
                      style={{ width: `${(area.weight / MAX_WEIGHT) * 100}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-white/60">{area.description}</p>
                </li>
              ))}
            </ul>
            <p className="mt-6 max-w-lg text-xs leading-relaxed text-white/60">
              Values count the most, personality the least. The AI can be wrong — you decide who to talk to.
            </p>
          </div>

          <div className="reveal rounded-3xl border border-white/15 bg-card p-7 shadow-2xl shadow-black/30 sm:p-9">
            <div className="flex items-center justify-center gap-5">
              {[a, b].map((p, i) => (
                <div key={p.name} className="contents">
                  {i === 1 && (
                    <span className="flex size-10 items-center justify-center rounded-full bg-background ring-1 ring-white/15">
                      <Heart className="size-4 fill-primary text-primary" aria-hidden />
                    </span>
                  )}
                  <div className="flex flex-col items-center gap-2">
                    <span
                      className={cn(
                        "flex size-16 items-center justify-center rounded-full bg-gradient-to-br font-display text-xl font-semibold text-primary-foreground sm:size-20 sm:text-2xl",
                        p.gradient,
                      )}
                    >
                      {p.initials}
                    </span>
                    <p className="text-sm text-white/80">
                      {p.name}, {p.age}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-7 flex flex-col items-center gap-2 text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/70 bg-background/80 px-4 py-1.5 text-sm font-semibold text-white">
                <Heart className="size-4 fill-primary text-primary" aria-hidden />
                {SHOWCASE.label}
              </span>
              <p className="text-sm text-white/70">{SHOWCASE.sublabel}</p>
            </div>

            <ul className="mt-6 space-y-2.5">
              {SHOWCASE.reasons.map((reason) => (
                <li key={reason} className="flex items-start gap-2.5 text-sm text-white/80">
                  <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                  {reason}
                </li>
              ))}
            </ul>

            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((v) => !v)}
              className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-full border border-white/15 text-sm font-semibold text-white outline-none transition-colors hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-ring"
            >
              {open ? "Hide the detail" : "Show me why"}
              <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} aria-hidden />
            </button>

            <div
              id={panelId}
              // `inert` takes the collapsed detail out of the tab order and the accessibility tree.
              inert={!open}
              className={cn(
                "grid transition-[grid-template-rows] duration-300",
                open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <p className="mt-6 text-sm font-medium text-white/80">How this pair scores on each of the six</p>
                <ul className="mt-3 divide-y divide-white/10">
                  {MATCH_AREAS.map((area, i) => (
                    <li key={area.label} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                      <span className="text-white/80">{area.label}</span>
                      <HeartMeter value={SHOWCASE.hearts[i]} />
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs leading-relaxed text-white/60">
                  Hearts, not a percentage. Each area counts by the weight listed for it.
                </p>
              </div>
            </div>

            <p className="mt-6 text-center text-xs text-white/60">Example — not real members.</p>

            <div className="mt-6 flex justify-center">
              <Button
                asChild
                className="group h-12 gap-2 rounded-full bg-gradient-brand px-7 text-base font-semibold text-white shadow-lg shadow-primary/25 hover:shadow-primary/40"
              >
                <Link href="/register">
                  Find out who you click with
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
