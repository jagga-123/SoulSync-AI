import { Check, Heart } from "lucide-react";
import { TIER_LABELS, TIER_STYLES } from "@/lib/ai-format";
import type { CompatibilityTier } from "@/types/api";

interface AIMatchPillProps {
  score: number;
  tier: CompatibilityTier;
  /** A heart only, for tight spaces (the row already says why); the label and overlap stay available
   * to screen readers and as a tooltip. */
  compact?: boolean;
  /** Little data on either side: say "Early read" instead of a firm label. */
  early?: boolean;
  className?: string;
}

/**
 * The human label for a match — "You two click", "On the same wavelength"… The percentage is deliberately not
 * the headline: it sits in the tooltip and is announced to screen readers as "overlap".
 */
export function AIMatchPill({ score, tier, compact = false, early = false, className = "" }: AIMatchPillProps) {
  const label = early ? "Early read" : TIER_LABELS[tier];
  return (
    <span
      title={`${label} — ${score}% overlap`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold backdrop-blur-md ${TIER_STYLES[tier]} ${className}`}
    >
      <Heart className="size-3.5 shrink-0 fill-primary text-primary" aria-hidden />
      <span className={compact ? "sr-only" : undefined}>{label}</span>
      <span className="sr-only"> ({score}% overlap)</span>
    </span>
  );
}

interface AIReasonsProps {
  reasons: string[];
  max?: number;
  className?: string;
}

/** The top reasons two people match, as a compact checklist. */
export function AIReasons({ reasons, max = 3, className = "" }: AIReasonsProps) {
  const shown = reasons.slice(0, max);
  if (shown.length === 0) return null;

  return (
    <ul className={`space-y-1.5 ${className}`}>
      {shown.map((reason) => (
        <li key={reason} className="flex items-start gap-2 text-xs leading-snug text-white/75">
          <Check className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
          <span>{reason}</span>
        </li>
      ))}
    </ul>
  );
}
