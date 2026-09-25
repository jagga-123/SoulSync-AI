import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export function CTASection() {
  return (
    <section className="relative overflow-clip py-24 sm:py-32">
      {/* The mark, very large and very faint — the one decorative flourish on the page. */}
      <LogoMark className="pointer-events-none absolute left-1/2 top-1/2 w-[34rem] max-w-none -translate-x-1/2 -translate-y-1/2 opacity-[0.07]" />

      <div className="reveal relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="text-balance font-display text-4xl font-semibold leading-tight tracking-tight text-white sm:text-6xl">
          Your next conversation could be a good one.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-pretty leading-relaxed text-white/70">
          About ten minutes with our AI. No swiping, no pressure — just a start.
        </p>
        <div className="mt-10 flex justify-center">
          <Button
            asChild
            size="lg"
            className="group h-14 gap-2 rounded-full bg-gradient-brand px-9 text-base font-semibold text-white shadow-2xl shadow-primary/30 transition-shadow hover:shadow-primary/50"
          >
            <Link href="/register">
              Create my profile
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
          </Button>
        </div>
        <p className="mt-6 text-sm text-white/60">Free to join · Takes about 10 minutes</p>
      </div>
    </section>
  );
}
