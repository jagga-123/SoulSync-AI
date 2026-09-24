import Link from "next/link";
import { ExternalLink, Heart } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RevealText, FadeIn } from "@/components/effects/reveal-text";
import { FOUNDING_NOTES, MIN_FOUNDING_NOTES, SOURCE_CODE_URL } from "@/lib/data";

/**
 * Real quotes from real members. Renders nothing until there are enough of them — a thin or invented wall
 * of praise does more harm than an empty space. Add entries in `FOUNDING_NOTES` (lib/data.ts) only when a
 * member has actually said it and agreed to be quoted.
 */
function FoundingNotes() {
  if (FOUNDING_NOTES.length < MIN_FOUNDING_NOTES) return null;

  return (
    <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {FOUNDING_NOTES.map((note) => (
        <li key={`${note.name}-${note.quote.slice(0, 24)}`} className="glass rounded-3xl p-6">
          <p className="text-sm leading-relaxed text-white/85">&ldquo;{note.quote}&rdquo;</p>
          <p className="mt-4 text-sm font-semibold text-white">
            {note.name}
            {note.city && <span className="font-normal text-white/60"> · {note.city}</span>}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** Honest social proof for a product that has just launched: no invented crowd, just what's true. */
export function EarlyAccessSection() {
  return (
    <section id="early-access" className="relative py-28 sm:py-36">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <FadeIn className="flex justify-center">
            <Badge className="glass gap-1.5 rounded-full border-white/15 px-4 py-1.5 text-xs font-medium text-white/80">
              <Heart className="size-3.5 fill-primary text-primary" />
              Early access
            </Badge>
          </FadeIn>

          <RevealText
            as="h2"
            text="Be one of the first."
            className="mt-5 text-balance font-display text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl"
            stagger={0.05}
          />

          <FadeIn delay={0.2}>
            <p className="mt-5 text-pretty leading-relaxed text-white/70">
              SoulSync is new, and we&apos;re opening it up gradually. You won&apos;t find made-up reviews
              here — just an honest start, and a promise to tell you what the AI does and what it can&apos;t.
            </p>
          </FadeIn>
        </div>

        <FadeIn delay={0.3}>
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            <div className="glass flex flex-col rounded-3xl p-7">
              <h3 className="font-display text-xl font-semibold text-white">Join early</h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-white/70">
                It&apos;s free to join. Spend about ten minutes chatting with our AI and see who you might
                click with — and why.
              </p>
              <Button
                asChild
                className="mt-6 h-11 w-fit rounded-full bg-gradient-brand px-6 font-semibold text-white shadow-lg shadow-primary/25 hover:opacity-90"
              >
                <Link href="/register">Create my profile</Link>
              </Button>
            </div>

            <div className="glass flex flex-col rounded-3xl p-7">
              <h3 className="font-display text-xl font-semibold text-white">Built in the open</h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-white/70">
                Curious how it works? The code is public, so you can see exactly how matching, privacy and
                safety are built — no marketing gloss.
              </p>
              <Button
                asChild
                variant="outline"
                className="mt-6 h-11 w-fit gap-2 rounded-full border-white/15 bg-white/[0.03] px-6 font-semibold text-white hover:bg-white/[0.08]"
              >
                <a href={SOURCE_CODE_URL} target="_blank" rel="noopener noreferrer">
                  See the code
                  <ExternalLink className="size-4" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </Button>
            </div>
          </div>
        </FadeIn>

        <FoundingNotes />
      </div>
    </section>
  );
}
