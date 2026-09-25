import { ChevronDown } from "lucide-react";

import { SectionHeading } from "@/components/sections/section-heading";
import { FAQ_ITEMS } from "@/lib/data";

/** Questions people ask before they sign up. Native <details>: keyboard and screen-reader friendly, and it works with no JavaScript. */
export function FaqSection() {
  // FAQPage structured data — the same text that's on the page, nothing more.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <section id="faq" aria-labelledby="faq-title" className="relative py-24 sm:py-32">
      <script
        type="application/ld+json"
        // `<` is escaped so no answer can ever close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <SectionHeading id="faq-title" eyebrow="FAQ" title="Questions, answered" />

        <div className="reveal mt-12 divide-y divide-white/10 rounded-3xl border border-white/10 bg-white/[0.03]">
          {FAQ_ITEMS.map((item) => (
            <details key={item.q} className="group px-6 py-1 open:pb-3">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-md py-3 text-left font-display text-lg font-semibold text-white outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDown
                  className="size-5 shrink-0 text-white/60 transition-transform duration-200 group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="pb-2 pr-8 text-[15px] leading-relaxed text-white/70">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
