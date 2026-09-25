import { SectionHeading } from "@/components/sections/section-heading";
import { FEATURES } from "@/lib/data";

/** "Different on purpose" — three cards and a quiet line of reassurance. Static markup. */
export function FeaturesSection() {
  return (
    <section id="features" aria-labelledby="features-title" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-8xl px-4 sm:px-6 lg:px-8">
        <SectionHeading id="features-title" eyebrow="What's different" title="Different on purpose">
          <p>
            Three choices that shape everything else — how we get to know you, how we explain a match,
            and how we treat your privacy.
          </p>
        </SectionHeading>

        <ul className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <li
              key={feature.title}
              className="reveal rounded-3xl border border-white/10 bg-white/[0.04] p-7 transition-colors duration-300 hover:border-white/25"
            >
              <span className="flex size-12 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
                <feature.icon className="size-5 text-accent" aria-hidden />
              </span>
              <h3 className="mt-5 font-display text-lg font-semibold text-white">{feature.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-white/70">{feature.description}</p>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-center text-sm text-white/60">Free to start · Report or block anyone, any time</p>
      </div>
    </section>
  );
}
