"use client";

import { useEffect, useRef, type ReactNode, type PointerEvent } from "react";
import Link from "next/link";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { ArrowRight, ChevronDown, Heart } from "lucide-react";
import gsap from "gsap";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AvatarOrb } from "@/components/ui/avatar-orb";
import { HeartPulse } from "@/components/brand/heart-pulse";
import { MagneticButton } from "@/components/effects/magnetic-button";
import { TiltCard } from "@/components/effects/tilt-card";
import { FloatingParticles } from "@/components/effects/floating-particles";
import { RevealText, FadeIn } from "@/components/effects/reveal-text";
import { ConnectionLines } from "@/components/effects/connection-lines";
import { OrbitParticles } from "@/components/effects/orbit-particles";
import { EXAMPLE_PROFILES } from "@/lib/data";

const CARD_POINTS: [
  { x: number; y: number },
  { x: number; y: number },
  { x: number; y: number },
] = [
  { x: 76, y: 10 },
  { x: 14, y: 45 },
  { x: 60, y: 86 },
];

type Accent = "primary" | "secondary" | "accent";

/** Layout and motion for each of the three floating example cards, in the order of EXAMPLE_PROFILES. */
const CARD_LAYOUT: Array<{
  depth: number;
  wrapperClassName: string;
  floatClassName: string;
  floatDelay: string;
  orbit: { size: number; count: number; duration: number; colorClassName: string; reverse?: boolean };
  cardClassName: string;
  accent: Accent;
  badgeClassName: string;
  badgeFloatDelay: string;
}> = [
  {
    depth: 10,
    wrapperClassName: "absolute right-2 top-0 w-72",
    floatClassName: "animate-float-slow",
    floatDelay: "0s",
    orbit: { size: 224, count: 3, duration: 15, colorClassName: "bg-primary text-primary" },
    cardClassName: "glass-strong glow-primary",
    accent: "primary",
    badgeClassName: "-bottom-3 -left-3",
    badgeFloatDelay: "0.3s",
  },
  {
    depth: 16,
    wrapperClassName: "absolute left-0 top-48 w-64",
    floatClassName: "animate-float-slower",
    floatDelay: "0.6s",
    orbit: { size: 200, count: 4, duration: 13, colorClassName: "bg-secondary text-secondary", reverse: true },
    cardClassName: "glass-strong",
    accent: "secondary",
    badgeClassName: "-top-3 -right-3",
    badgeFloatDelay: "0.9s",
  },
  {
    depth: 22,
    wrapperClassName: "absolute bottom-0 right-8 w-64",
    floatClassName: "animate-float-slow",
    floatDelay: "1.1s",
    orbit: { size: 196, count: 3, duration: 17, colorClassName: "bg-accent text-accent" },
    cardClassName: "glass-strong glow-accent",
    accent: "accent",
    badgeClassName: "-top-3 -left-3",
    badgeFloatDelay: "1.5s",
  },
];

function ParallaxCard({
  depth,
  mx,
  my,
  wrapperClassName,
  floatClassName,
  floatDelay,
  children,
}: {
  depth: number;
  mx: ReturnType<typeof useMotionValue<number>>;
  my: ReturnType<typeof useMotionValue<number>>;
  wrapperClassName?: string;
  floatClassName?: string;
  floatDelay?: string;
  children: ReactNode;
}) {
  // Each animation system (Framer parallax, CSS float, GSAP entrance) gets
  // its own DOM node — stacking three transform sources on one element
  // means only the highest-priority one (the CSS keyframe) ever renders,
  // silently dropping the other two.
  const x = useSpring(useTransform(mx, [-1, 1], [-depth, depth]), {
    stiffness: 120,
    damping: 20,
    mass: 0.4,
  });
  const y = useSpring(useTransform(my, [-1, 1], [-depth * 0.7, depth * 0.7]), {
    stiffness: 120,
    damping: 20,
    mass: 0.4,
  });

  return (
    <div className={wrapperClassName}>
      <motion.div style={{ x, y }}>
        <div className={floatClassName} style={{ animationDelay: floatDelay }}>
          <div data-hero-card>{children}</div>
        </div>
      </motion.div>
    </div>
  );
}

/** The match label on an example card — the same wording members see, never a made-up percentage. */
function MatchBadge({
  label,
  accent,
  positionClassName,
  floatDelay,
}: {
  label: string;
  accent: Accent;
  positionClassName: string;
  floatDelay: string;
}) {
  const dot = {
    primary: "bg-primary",
    secondary: "bg-secondary",
    accent: "bg-accent",
  }[accent];

  return (
    <div
      className={`absolute z-10 flex animate-float-slower items-center gap-1.5 rounded-full glass-strong px-3 py-1.5 shadow-lg shadow-primary/20 ${positionClassName}`}
      style={{ animationDelay: floatDelay }}
    >
      <span className="relative flex size-1.5">
        <span className={`absolute inset-0 rounded-full ${dot} animate-pulse-ring`} />
        <span className={`relative size-1.5 rounded-full ${dot}`} />
      </span>
      <span className="text-xs font-semibold text-white">{label}</span>
    </div>
  );
}

export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const cards = cardsRef.current?.querySelectorAll("[data-hero-card]");
      if (!cards?.length) return;

      gsap.timeline({ delay: 0.4 }).from(cards, {
        opacity: 0,
        y: 60,
        scale: 0.85,
        rotate: (i) => (i % 2 === 0 ? -8 : 8),
        duration: 1.1,
        stagger: 0.18,
        ease: "power3.out",
      });
    }, cardsRef);

    return () => ctx.revert();
  }, []);

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    const rect = sectionRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    mx.set(px * 2 - 1);
    my.set(py * 2 - 1);
  }

  function handlePointerLeave() {
    mx.set(0);
    my.set(0);
  }

  return (
    <section
      id="top"
      ref={sectionRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="relative flex min-h-[100svh] items-center overflow-hidden pt-24 pb-14"
    >
      <FloatingParticles className="z-0" count={30} />

      {/* A big, faint heart in the background — the product's signature pulse. */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-6%] top-[6%] hidden h-[110%] w-[58%] items-center justify-center opacity-[0.1] lg:flex"
      >
        <HeartPulse className="size-[30rem]" />
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-8xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-10 lg:px-8 xl:gap-16">
        <div>
          <FadeIn>
            <Badge className="glass gap-1.5 rounded-full border-white/15 px-4 py-1.5 text-xs font-medium text-white/80">
              <Heart className="size-3.5 fill-primary text-primary" />
              Early access · Free to join
            </Badge>
          </FadeIn>

          <RevealText
            as="h1"
            text="Start with who you are."
            className="mt-6 text-balance font-display text-5xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-[4.25rem]"
            wordClassName="text-gradient"
            stagger={0.06}
            delay={0.15}
          />

          <FadeIn delay={0.4}>
            <p className="mt-5 max-w-xl text-pretty font-display text-xl font-medium leading-snug text-white/90 sm:text-2xl">
              SoulSync begins with a conversation, not a photo.
            </p>
          </FadeIn>

          <FadeIn delay={0.55}>
            <p className="mt-5 max-w-lg text-pretty text-base leading-relaxed text-white/70 sm:text-lg">
              Chat with our AI for about ten minutes, then meet people who share your values, your
              interests and what you&apos;re really looking for.
            </p>
          </FadeIn>

          <FadeIn delay={0.7}>
            <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center">
              <MagneticButton>
                <Button
                  asChild
                  size="lg"
                  className="group h-12 gap-2 rounded-full bg-gradient-brand px-7 text-base font-semibold text-white shadow-xl shadow-primary/25 transition-shadow hover:shadow-primary/40"
                >
                  <Link href="/register">
                    Start the conversation
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                </Button>
              </MagneticButton>
              <MagneticButton>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-full border-white/15 bg-white/[0.03] px-7 text-base font-semibold text-white hover:bg-white/[0.08]"
                >
                  <a href="#how-it-works">See how it works</a>
                </Button>
              </MagneticButton>
            </div>
            <p className="mt-4 text-sm text-white/60">Free to join · About 10 minutes · No swiping</p>
          </FadeIn>
        </div>

        <div
          ref={cardsRef}
          className="relative hidden h-[560px] lg:block"
          aria-hidden
        >
          <ConnectionLines points={CARD_POINTS} />

          {EXAMPLE_PROFILES.map((profile, i) => {
            const layout = CARD_LAYOUT[i];
            return (
              <ParallaxCard
                key={profile.name}
                depth={layout.depth}
                mx={mx}
                my={my}
                wrapperClassName={layout.wrapperClassName}
                floatClassName={layout.floatClassName}
                floatDelay={layout.floatDelay}
              >
                <OrbitParticles {...layout.orbit} />
                <TiltCard className="rounded-3xl">
                  <div className={`${layout.cardClassName} rounded-3xl p-5`}>
                    <div className="flex items-center gap-3">
                      <AvatarOrb initials={profile.initials} gradient={profile.gradient} className="size-12 text-lg" />
                      <div>
                        <p className="font-display text-sm font-semibold text-white">
                          {profile.name}, {profile.age}
                        </p>
                        <p className="text-xs text-white/60">{profile.role}</p>
                      </div>
                    </div>
                  </div>
                  <MatchBadge
                    label={profile.label}
                    accent={layout.accent}
                    positionClassName={layout.badgeClassName}
                    floatDelay={layout.badgeFloatDelay}
                  />
                </TiltCard>
              </ParallaxCard>
            );
          })}

          <p className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs text-white/60">
            Example profiles — not real members
          </p>

          <div className="absolute left-1/2 top-1/2 -z-10 size-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl" />
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4, duration: 0.8 }}
        className="absolute inset-x-0 bottom-6 z-10 flex flex-col items-center gap-2 text-white/60"
      >
        <span className="text-xs uppercase tracking-[0.3em]">Scroll</span>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronDown className="size-4" />
        </motion.div>
      </motion.div>
    </section>
  );
}
