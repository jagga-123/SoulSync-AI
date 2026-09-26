"use client";

import { StreamingText } from "@/components/ai/streaming-text";

interface ExplanationCardProps {
  text: string;
  /** `llm` = written by the model; `template` = assembled by SoulSync from the facts it holds. */
  source: "llm" | "template";
  /** Reveal the text word by word (the first time it is shown). */
  animate?: boolean;
}

/** The plain-words "why we think you'd get along", set as a quote and always labelled with where it came from. */
export function ExplanationCard({ text, source, animate = false }: ExplanationCardProps) {
  return (
    <figure className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-white/60">Why we think you&apos;d get along</span>
        <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-xs font-medium text-white/75">
          {source === "llm" ? "Written by AI" : "Summary of what you share"}
        </span>
      </figcaption>
      <blockquote className="mt-3 border-l-2 border-primary/50 pl-3 text-sm leading-relaxed text-white/85">
        <StreamingText text={text} animate={animate} />
      </blockquote>
      {source === "llm" && <p className="mt-3 text-xs text-white/60">AI can be wrong — you decide who to talk to.</p>}
    </figure>
  );
}
