"use client";

import { useEffect, useRef, type ReactNode, type PointerEvent } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { ArrowRight, ChevronDown, Sparkles } from "lucide-react";
import gsap from "gsap";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AvatarOrb } from "@/components/ui/avatar-orb";
import { MagneticButton } from "@/components/effects/magnetic-button";
import { TiltCard } from "@/components/effects/tilt-card";
import { FloatingParticles } from "@/components/effects/floating-particles";
import { RevealText, FadeIn } from "@/components/effects/reveal-text";
import { ConnectionLines } from "@/components/effects/connection-lines";
import { OrbitParticles } from "@/components/effects/orbit-particles";
import { AIBrainVisualization } from "@/components/effects/ai-brain-visualization";
import { AnimatedCounter } from "@/components/effects/animated-counter";
import { PROFILE_CARDS } from "@/lib/data";

const CARD_POINTS: [
  { x: number; y: number },
  { x: number; y: number },
  { x: number; y: number },
] = [
  { x: 76, y: 10 },
  { x: 14, y: 45 },
  { x: 60, y: 86 },
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

function MatchBadge({
  match,
  delay,
  accent,
  positionClassName,
  floatDelay,
}: {
  match: number;
  delay: number;
  accent: "primary" | "secondary" | "accent";
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
      <span className="text-xs font-semibold text-white">
        <AnimatedCounter value={match} suffix="% match" delay={delay} />
      </span>
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

      <AIBrainVisualization
        className="right-[-6%] top-[-8%] hidden h-[130%] w-[64%] opacity-[0.18] lg:block"
      />

      <div className="relative z-10 mx-auto grid w-full max-w-8xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-10 lg:px-8 xl:gap-16">
        <div>
          <FadeIn>
            <Badge className="glass gap-1.5 rounded-full border-white/15 px-4 py-1.5 text-xs font-medium text-white/80">
              <Sparkles className="size-3.5 text-accent" />
              Powered by relationship-grade AI
            </Badge>
          </FadeIn>

          <RevealText
            as="h1"
            text="No Endless Swiping."
            className="mt-6 text-balance font-display text-5xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-[4.25rem]"
            wordClassName="text-gradient"
            stagger={0.06}
            delay={0.15}
          />

          <FadeIn delay={0.4}>
            <p className="mt-5 max-w-xl text-pretty font-display text-xl font-medium leading-snug text-white/90 sm:text-2xl">
              Your next match starts with a conversation, not a photo.
            </p>
          </FadeIn>

          <FadeIn delay={0.55}>
            <p className="mt-5 max-w-lg text-pretty text-base leading-relaxed text-white/60 sm:text-lg">
              SoulSync AI learns who you are through meaningful conversations
              and introduces you to people who genuinely match your
              personality, values, and relationship goals.
            </p>
          </FadeIn>

          <FadeIn delay={0.7}>
            <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center">
              <MagneticButton>
                <Button
                  size="lg"
                  className="group h-12 gap-2 rounded-full bg-gradient-brand px-7 text-base font-semibold text-white shadow-xl shadow-primary/25 transition-shadow hover:shadow-primary/40"
                >
                  Start Your First Conversation
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </MagneticButton>
              <MagneticButton>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-full border-white/15 bg-white/[0.03] px-7 text-base font-semibold text-white hover:bg-white/[0.08]"
                >
                  <a href="#matching-demo">See AI Matching In Action</a>
                </Button>
              </MagneticButton>
            </div>
          </FadeIn>
        </div>

        <div
          ref={cardsRef}
          className="relative hidden h-[560px] lg:block"
          aria-hidden
        >
          <ConnectionLines points={CARD_POINTS} />

          <ParallaxCard
            depth={10}
            mx={mx}
            my={my}
            wrapperClassName="absolute right-2 top-0 w-72"
            floatClassName="animate-float-slow"
            floatDelay="0s"
          >
            <OrbitParticles size={224} count={3} duration={15} colorClassName="bg-primary text-primary" />
            <TiltCard className="rounded-3xl">
              <div className="glass-strong glow-primary rounded-3xl p-5">
                <div className="flex items-center gap-3">
                  <AvatarOrb
                    initials={PROFILE_CARDS[0].initials}
                    gradient={PROFILE_CARDS[0].gradient}
                    className="size-12 text-lg"
                  />
                  <div>
                    <p className="font-display text-sm font-semibold text-white">
                      {PROFILE_CARDS[0].name}, {PROFILE_CARDS[0].age}
                    </p>
                    <p className="text-xs text-white/50">
                      {PROFILE_CARDS[0].role}
                    </p>
                  </div>
                </div>
              </div>
              <MatchBadge
                match={PROFILE_CARDS[0].match}
                delay={1.2}
                accent="primary"
                positionClassName="-bottom-3 -left-3"
                floatDelay="0.3s"
              />
            </TiltCard>
          </ParallaxCard>

          <ParallaxCard
            depth={16}
            mx={mx}
            my={my}
            wrapperClassName="absolute left-0 top-48 w-64"
            floatClassName="animate-float-slower"
            floatDelay="0.6s"
          >
            <OrbitParticles
              size={200}
              count={4}
              reverse
              duration={13}
              colorClassName="bg-secondary text-secondary"
            />
            <TiltCard className="rounded-3xl">
              <div className="glass-strong rounded-3xl p-5">
                <div className="flex items-center gap-3">
                  <AvatarOrb
                    initials={PROFILE_CARDS[1].initials}
                    gradient={PROFILE_CARDS[1].gradient}
                    className="size-12 text-lg"
                  />
                  <div>
                    <p className="font-display text-sm font-semibold text-white">
                      {PROFILE_CARDS[1].name}, {PROFILE_CARDS[1].age}
                    </p>
                    <p className="text-xs text-white/50">
                      {PROFILE_CARDS[1].role}
                    </p>
                  </div>
                </div>
              </div>
              <MatchBadge
                match={PROFILE_CARDS[1].match}
                delay={1.4}
                accent="secondary"
                positionClassName="-top-3 -right-3"
                floatDelay="0.9s"
              />
            </TiltCard>
          </ParallaxCard>

          <ParallaxCard
            depth={22}
            mx={mx}
            my={my}
            wrapperClassName="absolute bottom-0 right-8 w-64"
            floatClassName="animate-float-slow"
            floatDelay="1.1s"
          >
            <OrbitParticles size={196} count={3} duration={17} colorClassName="bg-accent text-accent" />
            <TiltCard className="rounded-3xl">
              <div className="glass-strong glow-accent rounded-3xl p-5">
                <div className="flex items-center gap-3">
                  <AvatarOrb
                    initials={PROFILE_CARDS[2].initials}
                    gradient={PROFILE_CARDS[2].gradient}
                    className="size-12 text-lg"
                  />
                  <div>
                    <p className="font-display text-sm font-semibold text-white">
                      {PROFILE_CARDS[2].name}, {PROFILE_CARDS[2].age}
                    </p>
                    <p className="text-xs text-white/50">
                      {PROFILE_CARDS[2].role}
                    </p>
                  </div>
                </div>
              </div>
              <MatchBadge
                match={PROFILE_CARDS[2].match}
                delay={1.6}
                accent="accent"
                positionClassName="-top-3 -left-3"
                floatDelay="1.5s"
              />
            </TiltCard>
          </ParallaxCard>

          <div className="absolute left-1/2 top-1/2 -z-10 size-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl" />
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4, duration: 0.8 }}
        className="absolute inset-x-0 bottom-6 z-10 flex flex-col items-center gap-2 text-white/40"
      >
        <span className="text-[11px] uppercase tracking-[0.3em]">Scroll</span>
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
