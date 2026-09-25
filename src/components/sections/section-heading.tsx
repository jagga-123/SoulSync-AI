import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  /** Small label above the title — plain words, not a badge. */
  eyebrow: string;
  title: string;
  /** Id for the <h2>, so a section can be labelled by it. */
  id?: string;
  align?: "center" | "left";
  className?: string;
  children?: ReactNode;
}

/** The eyebrow + title + intro that opens each landing section. Static markup; it fades up on scroll via the `.reveal` CSS. */
export function SectionHeading({ eyebrow, title, id, align = "center", className, children }: SectionHeadingProps) {
  return (
    <div className={cn("reveal", align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-xl", className)}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{eyebrow}</p>
      <h2
        id={id}
        className="mt-3 text-balance font-display text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl"
      >
        {title}
      </h2>
      {children && <div className="mt-5 text-pretty leading-relaxed text-white/70">{children}</div>}
    </div>
  );
}
