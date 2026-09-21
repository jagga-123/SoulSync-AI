import { AnimatedCounter } from "@/components/effects/animated-counter";
import { FadeIn } from "@/components/effects/reveal-text";
import { TRUST_STATS } from "@/lib/data";

export function TrustBarSection() {
  return (
    <section className="relative border-y border-white/10 bg-white/[0.02] py-10 sm:py-12">
      <div className="mx-auto max-w-8xl px-4 sm:px-6 lg:px-8">
        <FadeIn>
          <div className="grid grid-cols-1 divide-y divide-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {TRUST_STATS.map((stat, index) => (
              <div
                key={stat.label}
                className="flex flex-col items-center gap-1 py-6 text-center first:pt-0 last:pb-0 sm:py-0"
              >
                <p className="font-display text-3xl font-semibold sm:text-4xl">
                  <span className="text-gradient-brand">
                    <AnimatedCounter
                      value={stat.value}
                      suffix={stat.suffix}
                      decimals={stat.decimals}
                      delay={0.15 + index * 0.1}
                    />
                  </span>
                </p>
                <p className="text-sm text-white/50">{stat.label}</p>
              </div>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
