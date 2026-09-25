import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { SectionHeading } from "@/components/sections/section-heading";
import { AI_POINTS } from "@/lib/data";

/** A plain-English statement of what the AI does and doesn't do, with a link to the fuller page. */
export function OurAISection() {
  return (
    <section id="our-ai" aria-labelledby="our-ai-title" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <SectionHeading id="our-ai-title" eyebrow="Our AI" title="Being honest about the AI">
          <p>SoulSync uses AI in two places. Here&apos;s exactly what it does, and where it stops.</p>
        </SectionHeading>

        <ul className="mt-14 grid gap-5 sm:grid-cols-2">
          {AI_POINTS.map((point) => (
            <li key={point.title} className="reveal flex gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
                <point.icon className="size-5 text-accent" aria-hidden />
              </span>
              <div>
                <h3 className="font-display text-lg font-semibold text-white">{point.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-white/70">{point.body}</p>
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-center">
          <Link
            href="/how-our-ai-works"
            className="group inline-flex items-center gap-2 rounded-md text-sm font-semibold text-primary outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-ring"
          >
            How our AI works, in plain English
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </Link>
        </p>
      </div>
    </section>
  );
}
