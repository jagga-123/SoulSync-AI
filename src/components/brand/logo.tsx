import { useId } from "react";

import { HEART_PATH } from "@/components/brand/heart-path";
import { cn } from "@/lib/utils";

interface LogoMarkProps {
  className?: string;
  /** Give the mark an accessible name when it stands alone (a link with no visible text). */
  label?: string;
}

/**
 * The SoulSync mark: one heart, two halves (two people, one seam). Colours come from `--logo-left` /
 * `--logo-right` and fall back to the theme's rose and lilac, so it follows the theme automatically.
 * Reads clearly down to 16 px. Never add a gradient, tilt it or recolour it outside the palette.
 */
export function LogoMark({ className, label }: LogoMarkProps) {
  // Each instance needs its own clipPath ids (the page can hold several logos at once).
  const id = useId().replace(/:/g, "");

  return (
    <svg
      viewBox="0 0 48 44"
      className={cn("h-auto w-7 shrink-0", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <clipPath id={`${id}l`}>
          <rect x="0" y="0" width="23.1" height="44" />
        </clipPath>
        <clipPath id={`${id}r`}>
          <rect x="24.9" y="0" width="23.1" height="44" />
        </clipPath>
      </defs>
      <path d={HEART_PATH} fill="var(--logo-left, var(--primary))" clipPath={`url(#${id}l)`} />
      <path d={HEART_PATH} fill="var(--logo-right, var(--secondary))" clipPath={`url(#${id}r)`} />
    </svg>
  );
}

interface LogoProps {
  className?: string;
  /** Hide the wordmark (below the `md` breakpoint when true) — used by the compact mobile app bar. */
  compact?: boolean;
  markClassName?: string;
}

/**
 * The lockup: mark + "SoulSync". "Soul" is Fraunces 600, "Sync" is Fraunces italic 500 — no "AI" in the wordmark.
 * Wrap it in a link at the call site; the visible text is the accessible name.
 */
export function Logo({ className, compact = false, markClassName }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={markClassName} />
      <span
        className={cn(
          "font-display text-xl font-semibold leading-none tracking-tight text-foreground",
          compact && "hidden md:inline",
        )}
      >
        Soul<span className="font-medium italic [font-family:var(--font-display-italic),var(--font-display),serif]">Sync</span>
      </span>
    </span>
  );
}
