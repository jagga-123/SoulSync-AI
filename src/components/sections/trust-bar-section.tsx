import { FadeIn } from "@/components/effects/reveal-text";
import { TRUST_FACTS } from "@/lib/data";

/** Three plain facts about how SoulSync works — each one true today, none of them a number we can't back up. */
export function TrustBarSection() {
  return (
    <section
      aria-labelledby="what-makes-us-different"
      className="relative border-y border-white/10 bg-white/[0.02] py-10 sm:py-12"
    >
      <h2 id="what-makes-us-different" className="sr-only">
        What makes SoulSync different
      </h2>
      <div className="mx-auto max-w-8xl px-4 sm:px-6 lg:px-8">
        <FadeIn>
          <ul className="grid grid-cols-1 divide-y divide-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {TRUST_FACTS.map((fact) => (
              <li
                key={fact.title}
                className="flex flex-col items-center gap-2 px-4 py-6 text-center first:pt-0 last:pb-0 sm:py-0"
              >
                <span className="flex size-11 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
                  <fact.icon className="size-5 text-accent" aria-hidden />
                </span>
                <p className="font-display text-lg font-semibold text-white">{fact.title}</p>
                <p className="max-w-xs text-sm leading-relaxed text-white/70">{fact.description}</p>
              </li>
            ))}
          </ul>
        </FadeIn>
      </div>
    </section>
  );
}
