import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PhoneMock } from "@/components/sections/phone-mock";

/**
 * The first screen. A server component with no client JavaScript: the headline is in the HTML, so it paints
 * immediately, and the only motion is the CSS chat animation inside the phone illustration.
 */
export function HeroSection() {
  return (
    <section id="top" className="relative overflow-hidden pb-14 pt-28 lg:flex lg:min-h-[100svh] lg:items-center lg:pt-24">
      {/* One soft, static glow behind the phone — no animated background. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 top-16 size-[34rem] rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--brand-plum)_45%,transparent),transparent_68%)] lg:right-[4%] lg:top-1/4"
      />

      <div className="relative z-10 mx-auto grid w-full max-w-8xl grid-cols-1 items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-10 lg:px-8 xl:gap-16">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-1.5 text-xs font-medium text-white/80">
            <span aria-hidden className="size-1.5 rounded-full bg-primary" />
            Early access · Free to join
          </p>

          <h1 className="mt-6 text-balance font-display text-5xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-[4.25rem]">
            Start with <span className="text-gradient">who you are.</span>
          </h1>

          <p className="mt-5 max-w-xl text-pretty font-display text-xl font-medium leading-snug text-white/90 sm:text-2xl">
            SoulSync begins with a conversation, not a photo.
          </p>

          <p className="mt-5 max-w-lg text-pretty text-base leading-relaxed text-white/70 sm:text-lg">
            Chat with our AI for about ten minutes, then meet people who share your values, your
            interests and what you&apos;re really looking for.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <Button
              asChild
              size="lg"
              className="group h-12 gap-2 rounded-full bg-gradient-brand px-7 text-base font-semibold text-white shadow-xl shadow-primary/25 transition-shadow hover:shadow-primary/40"
            >
              <Link href="/register">
                Start the conversation
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 rounded-full border-white/15 bg-white/[0.03] px-7 text-base font-semibold text-white hover:bg-white/[0.08]"
            >
              <a href="#how-it-works">See how it works</a>
            </Button>
          </div>
          <p className="mt-4 text-sm text-white/60">Free to join · About 10 minutes · No swiping</p>
        </div>

        <PhoneMock className="lg:justify-self-center" />
      </div>
    </section>
  );
}
