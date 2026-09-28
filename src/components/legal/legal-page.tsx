import type { ReactNode } from "react";

/** Shared scaffold for the legal/support pages (Privacy, Terms, Safety, Contact) —
 * same article layout and typography as /how-our-ai-works. */
export function LegalPage({ eyebrow, title, updated, intro, children }: { eyebrow: string; title: string; updated: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 pb-24 pt-32 sm:px-6 lg:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{eyebrow}</p>
      <h1 className="mt-3 text-balance font-display text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl">{title}</h1>
      <p className="mt-4 text-sm text-white/55">Last updated {updated}</p>
      {intro && <div className="mt-5 space-y-4 text-lg leading-relaxed text-white/80">{intro}</div>}
      {children}
    </article>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-14">
      <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">{title}</h2>
      <div className="mt-4 space-y-4 leading-relaxed text-white/75">{children}</div>
    </section>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5 marker:text-white/40">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
