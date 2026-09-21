"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { TiltCard } from "@/components/effects/tilt-card";
import { RevealText, FadeIn } from "@/components/effects/reveal-text";
import { FEATURES } from "@/lib/data";

gsap.registerPlugin(ScrollTrigger);

export function FeaturesSection() {
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const cards = gsap.utils.toArray<HTMLElement>("[data-feature-card]");

      cards.forEach((card, i) => {
        gsap.fromTo(
          card,
          {
            opacity: 0,
            y: 70,
            scale: 0.9,
            rotate: i % 2 === 0 ? -3 : 3,
          },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            rotate: 0,
            duration: 0.85,
            delay: (i % 3) * 0.08,
            ease: "back.out(1.5)",
            scrollTrigger: {
              trigger: card,
              start: "top 88%",
            },
          },
        );
      });
    }, gridRef);

    return () => ctx.revert();
  }, []);

  return (
    <section id="features" className="relative py-28 sm:py-36">
      <div className="mx-auto max-w-8xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <FadeIn className="flex justify-center">
            <Badge className="glass gap-1.5 rounded-full border-white/15 px-4 py-1.5 text-xs font-medium text-white/80">
              <Sparkles className="size-3.5 text-accent" />
              Everything you need
            </Badge>
          </FadeIn>

          <RevealText
            as="h2"
            text="Built for connection that lasts"
            className="mt-5 text-balance font-display text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl"
            stagger={0.04}
          />

          <FadeIn delay={0.2}>
            <p className="mt-5 text-pretty leading-relaxed text-white/60">
              A thoughtful set of tools, all working quietly in the
              background so you can focus on the person, not the platform.
            </p>
          </FadeIn>
        </div>

        <div
          ref={gridRef}
          className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {FEATURES.map((feature) => (
            <div key={feature.title} data-feature-card style={{ transformStyle: "preserve-3d" }}>
              <TiltCard className="h-full rounded-3xl" maxTilt={7}>
                <div className="glass group relative h-full overflow-hidden rounded-3xl p-7 transition-colors duration-300 hover:border-white/25">
                  <div className="absolute -right-10 -top-10 size-32 rounded-full bg-gradient-brand opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-25" />

                  <div className="relative flex size-12 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
                    <feature.icon className="size-5 text-accent" />
                  </div>

                  <h3 className="relative mt-5 font-display text-lg font-semibold text-white">
                    {feature.title}
                  </h3>
                  <p className="relative mt-2.5 text-sm leading-relaxed text-white/55">
                    {feature.description}
                  </p>
                </div>
              </TiltCard>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
