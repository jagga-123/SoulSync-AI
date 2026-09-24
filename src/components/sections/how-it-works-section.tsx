"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Heart } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { RevealText, FadeIn } from "@/components/effects/reveal-text";
import { PROCESS_STEPS } from "@/lib/data";

gsap.registerPlugin(ScrollTrigger);

export function HowItWorksSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (lineRef.current) {
        gsap.fromTo(
          lineRef.current,
          { scaleX: 0 },
          {
            scaleX: 1,
            transformOrigin: "left center",
            ease: "none",
            scrollTrigger: {
              trigger: sectionRef.current,
              start: "top 65%",
              end: "bottom 55%",
              scrub: 0.6,
            },
          },
        );
      }

      const cards = gsap.utils.toArray<HTMLElement>("[data-step-card]");
      cards.forEach((card, i) => {
        gsap.fromTo(
          card,
          { opacity: 0, y: 60 },
          {
            opacity: 1,
            y: 0,
            duration: 0.9,
            delay: i * 0.08,
            ease: "power3.out",
            scrollTrigger: {
              trigger: card,
              start: "top 85%",
            },
          },
        );
      });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      className="relative py-28 sm:py-36"
    >
      <div className="mx-auto max-w-8xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <FadeIn className="flex justify-center">
            <Badge className="glass gap-1.5 rounded-full border-white/15 px-4 py-1.5 text-xs font-medium text-white/80">
              <Heart className="size-3.5 fill-primary text-primary" />
              Simple by design
            </Badge>
          </FadeIn>

          <RevealText
            as="h2"
            text="From first hello to real connection"
            className="mt-5 text-balance font-display text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl"
            stagger={0.04}
          />

          <FadeIn delay={0.2}>
            <p className="mt-5 text-pretty leading-relaxed text-white/60">
              Three steps. No forms, no quizzes.
            </p>
          </FadeIn>
        </div>

        <div className="relative mt-20">
          <div className="pointer-events-none absolute left-0 right-0 top-8 hidden h-px bg-white/10 md:block" />
          <div
            ref={lineRef}
            className="pointer-events-none absolute left-0 right-0 top-8 hidden h-px bg-gradient-to-r from-primary via-secondary to-accent md:block"
          />

          <div className="grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-8">
            {PROCESS_STEPS.map((step) => (
              <div key={step.index} data-step-card className="relative">
                <div className="relative z-10 mb-6 flex size-16 items-center justify-center rounded-2xl bg-gradient-brand shadow-lg shadow-primary/20">
                  <step.icon className="size-7 text-white" />
                </div>
                <div className="glass rounded-2xl p-6">
                  <span className="font-display text-sm font-semibold text-white/60">
                    {step.index}
                  </span>
                  <h3 className="mt-2 font-display text-xl font-semibold text-white">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-white/55">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
