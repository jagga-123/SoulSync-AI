import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TIER_LABELS, TIER_SUBLINES } from "@/lib/ai-format";
import { MATCH_AREAS } from "@/lib/data";

export const metadata: Metadata = {
  title: "How our AI works",
  alternates: { canonical: "/how-our-ai-works" },
  description:
    "What SoulSync's AI does, what it doesn't, and where it can be wrong — in plain English: how the interview works, how matches are worked out, and what you control.",
};

const TIERS = Object.keys(TIER_LABELS) as Array<keyof typeof TIER_LABELS>;

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-14">
      <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">{title}</h2>
      <div className="mt-4 space-y-4 leading-relaxed text-white/75">{children}</div>
    </section>
  );
}

/** A plain-English page. Every statement here describes what the product does today (backend/src/ai/*) — keep it that way. */
export default function HowOurAiWorksPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 pb-24 pt-32 sm:px-6 lg:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Our AI</p>
      <h1 className="mt-3 text-balance font-display text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl">
        How our AI works
      </h1>
      <p className="mt-5 text-lg leading-relaxed text-white/80">
        SoulSync uses AI for two jobs: asking you questions, and explaining your matches in words. The matching
        itself is plain arithmetic. Here is what each part does, what it doesn&apos;t, and where it can go wrong.
      </p>

      <Block title="1. Sol asks the questions">
        <p>
          Sol is our AI interviewer — an AI, not a person. It asks 15 to 25 questions, about ten minutes in all, and
          each question builds on what you just said.
        </p>
        <p>
          Your answers are sent to an outside AI service so Sol can write the next question and, at the end,
          summarise what you told it into your personality report. If that service can&apos;t be reached, Sol falls
          back to a fixed set of questions instead.
        </p>
        <p>Only you can see your full report. The people you match with see what you have in common, not the report.</p>
      </Block>

      <Block title="2. Matching is plain arithmetic">
        <p>
          The AI does not decide who you match with. Matches are worked out by fixed rules that compare six things
          about you and the other person, each counting for a set share of the result:
        </p>
        <ul className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.03]">
          {MATCH_AREAS.map((area) => (
            <li key={area.label} className="flex items-start justify-between gap-4 px-5 py-3.5">
              <div>
                <p className="font-medium text-white">{area.label}</p>
                <p className="text-sm text-white/70">{area.description}</p>
              </div>
              <span className="pt-0.5 font-semibold tabular-nums text-accent">
                {area.weight}%<span className="sr-only"> of the overall read</span>
              </span>
            </li>
          ))}
        </ul>
        <p>
          If we don&apos;t have information about one of the six for someone, that area is left out and the rest are
          re-weighted — a gap is never counted against you.
        </p>
      </Block>

      <Block title="3. The AI explains, in words">
        <p>
          Once two people have been compared, the AI&apos;s job is to describe the match: which values and interests
          you share, and how your ways of talking fit. If it isn&apos;t available, we use a simpler built-in
          description.
        </p>
        <p>Every match gets one of four labels, so you never have to decode a number:</p>
        <ul className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.03]">
          {TIERS.map((tier) => (
            <li key={tier} className="px-5 py-3.5">
              <p className="font-medium text-white">{TIER_LABELS[tier]}</p>
              <p className="text-sm text-white/70">{TIER_SUBLINES[tier]}</p>
            </li>
          ))}
        </ul>
      </Block>

      <Block title="Where it can be wrong">
        <ul className="list-disc space-y-2 pl-5 marker:text-white/40">
          <li>It only knows what you told it. A rushed answer gives a rougher picture.</li>
          <li>A summary can misread you. If your report doesn&apos;t sound like you, redo the interview.</li>
          <li>Two people can match on paper and still not click. Chemistry isn&apos;t something we can measure.</li>
        </ul>
      </Block>

      <Block title="What you control">
        <ul className="list-disc space-y-2 pl-5 marker:text-white/40">
          <li>You decide who to like, whose likes to accept or decline, and who to talk to. A suggestion is only a suggestion.</li>
          <li>You can redo the interview whenever you like.</li>
          <li>You can report or block anyone, from their profile or from a chat.</li>
        </ul>
      </Block>

      <div className="mt-16 rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
        <p className="font-display text-2xl font-semibold text-white">Ready to try it?</p>
        <p className="mt-2 text-white/70">About ten minutes. Free to join.</p>
        <Button
          asChild
          size="lg"
          className="group mt-6 h-12 gap-2 rounded-full bg-gradient-brand px-7 text-base font-semibold text-white shadow-lg shadow-primary/25 hover:shadow-primary/40"
        >
          <Link href="/register">
            Start the conversation
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </Link>
        </Button>
      </div>
    </article>
  );
}
