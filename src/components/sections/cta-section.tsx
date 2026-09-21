"use client";

import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AvatarOrb } from "@/components/ui/avatar-orb";
import { MagneticButton } from "@/components/effects/magnetic-button";
import { RevealText, FadeIn } from "@/components/effects/reveal-text";
import { FloatingParticles } from "@/components/effects/floating-particles";

const STACK = [
  { initials: "A", gradient: "from-primary to-secondary" },
  { initials: "M", gradient: "from-secondary to-accent" },
  { initials: "N", gradient: "from-accent to-primary" },
  { initials: "S", gradient: "from-primary to-accent" },
];

export function CTASection() {
  return (
    <section className="relative overflow-hidden py-28 sm:py-36">
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 -z-10 size-[900px] -translate-x-1/2 -translate-y-1/2 animate-aurora-2"
      >
        <div className="size-full animate-blob-morph bg-[radial-gradient(circle,color-mix(in_oklch,var(--secondary)_35%,transparent)_0%,transparent_65%)]" />
      </div>
      <FloatingParticles count={16} seed={42} />

      <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <FadeIn>
          <RevealText
            as="h2"
            text="Your person is out there. Let's find them."
            className="text-balance font-display text-4xl font-semibold leading-tight tracking-tight text-white sm:text-6xl"
            wordClassName="text-gradient"
            stagger={0.05}
          />
        </FadeIn>

        <FadeIn delay={0.35}>
          <p className="mx-auto mt-6 max-w-xl text-pretty leading-relaxed text-white/60">
            Start a real conversation, and let our AI do what it does best:
            understand you, then introduce you to someone worth knowing.
          </p>
        </FadeIn>

        <FadeIn delay={0.5}>
          <div className="mt-10 flex justify-center">
            <MagneticButton>
              <Button
                size="lg"
                className="group h-14 gap-2 rounded-full bg-gradient-brand px-9 text-base font-semibold text-white shadow-2xl shadow-primary/30 transition-shadow hover:shadow-primary/50"
              >
                Start Your First Conversation
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </MagneticButton>
          </div>
        </FadeIn>

        <FadeIn delay={0.65}>
          <div className="mt-9 flex items-center justify-center gap-3">
            <div className="flex -space-x-3">
              {STACK.map((p) => (
                <AvatarOrb
                  key={p.initials}
                  initials={p.initials}
                  gradient={p.gradient}
                  className="size-9 border-2 border-background text-xs"
                />
              ))}
            </div>
            <p className="text-sm text-white/50">
              Joined by 2.4M+ people finding real connection
            </p>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
