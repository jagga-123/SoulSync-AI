import { Sparkles, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { AvatarOrb } from "@/components/ui/avatar-orb";
import { RevealText, FadeIn } from "@/components/effects/reveal-text";
import { ScrollZoom } from "@/components/effects/scroll-zoom";
import { TESTIMONIALS } from "@/lib/data";
import type { Testimonial } from "@/types";

const GRADIENTS = [
  "from-primary to-secondary",
  "from-secondary to-accent",
  "from-accent to-primary",
];

function TestimonialCard({
  testimonial,
  gradient,
}: {
  testimonial: Testimonial;
  gradient: string;
}) {
  return (
    <div className="glass mx-3 flex w-[360px] shrink-0 flex-col rounded-3xl p-6">
      <div className="flex items-center gap-1">
        {Array.from({ length: testimonial.rating }).map((_, i) => (
          <Star key={i} className="size-3.5 fill-accent text-accent" />
        ))}
      </div>
      <p className="mt-4 text-sm leading-relaxed text-white/75">
        &ldquo;{testimonial.quote}&rdquo;
      </p>
      <div className="mt-6 flex items-center gap-3">
        <AvatarOrb
          initials={testimonial.initials}
          gradient={gradient}
          className="size-10 text-sm"
        />
        <div>
          <p className="text-sm font-semibold text-white">
            {testimonial.name}
          </p>
          <p className="text-xs text-white/45">{testimonial.location}</p>
        </div>
      </div>
    </div>
  );
}

function MarqueeRow({
  reverse = false,
  gradientOffset = 0,
}: {
  reverse?: boolean;
  gradientOffset?: number;
}) {
  const items = [...TESTIMONIALS, ...TESTIMONIALS];

  return (
    <div className="fade-edges-x overflow-hidden">
      <div
        className={`flex w-max py-2 hover:[animation-play-state:paused] ${
          reverse ? "animate-marquee-reverse" : "animate-marquee"
        }`}
      >
        {items.map((testimonial, i) => (
          <TestimonialCard
            key={`${testimonial.name}-${i}`}
            testimonial={testimonial}
            gradient={GRADIENTS[(i + gradientOffset) % GRADIENTS.length]}
          />
        ))}
      </div>
    </div>
  );
}

export function TestimonialsSection() {
  return (
    <section id="testimonials" className="relative py-28 sm:py-36">
      <div className="mx-auto max-w-8xl px-4 sm:px-6 lg:px-8">
        <ScrollZoom className="mx-auto max-w-2xl text-center" from={0.9} to={1}>
          <FadeIn className="flex justify-center">
            <Badge className="glass gap-1.5 rounded-full border-white/15 px-4 py-1.5 text-xs font-medium text-white/80">
              <Sparkles className="size-3.5 text-accent" />
              Real stories
            </Badge>
          </FadeIn>

          <RevealText
            as="h2"
            text="Loved by people who found their person"
            className="mt-5 text-balance font-display text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl"
            stagger={0.04}
          />
        </ScrollZoom>
      </div>

      <div className="mt-16 space-y-6">
        <MarqueeRow />
        <MarqueeRow reverse gradientOffset={1} />
      </div>
    </section>
  );
}
