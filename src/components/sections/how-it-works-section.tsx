import { SectionHeading } from "@/components/sections/section-heading";
import { PROCESS_STEPS } from "@/lib/data";

/** Three steps. Static markup — the connecting line draws itself on scroll where the browser supports it (see `.reveal-line`). */
export function HowItWorksSection() {
  return (
    <section id="how-it-works" aria-labelledby="how-it-works-title" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-8xl px-4 sm:px-6 lg:px-8">
        <SectionHeading id="how-it-works-title" eyebrow="Simple by design" title="From first hello to real connection">
          <p>Three steps. No forms, no quizzes.</p>
        </SectionHeading>

        <div className="relative mt-16">
          <div aria-hidden className="pointer-events-none absolute left-0 right-0 top-8 hidden h-px bg-white/10 md:block" />
          <div
            aria-hidden
            className="reveal-line pointer-events-none absolute left-0 right-0 top-8 hidden h-px bg-gradient-to-r from-primary via-secondary to-accent md:block"
          />

          <ol className="grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-8">
            {PROCESS_STEPS.map((step) => (
              <li key={step.index} className="reveal relative">
                <div className="relative z-10 mb-6 flex size-16 items-center justify-center rounded-2xl bg-gradient-brand shadow-lg shadow-primary/20">
                  <step.icon className="size-7 text-white" aria-hidden />
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
                  <span className="font-display text-sm font-semibold text-white/60">{step.index}</span>
                  <h3 className="mt-2 font-display text-xl font-semibold text-white">{step.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-white/70">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
