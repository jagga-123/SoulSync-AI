import { Check, Sparkles } from "lucide-react";
import { TIER_LABELS, TIER_STYLES } from "@/lib/ai-format";
import type { CompatibilityTier } from "@/types/api";

interface AIMatchPillProps {
  score: number;
  tier: CompatibilityTier;
  /** Score only ("94%") for tight spaces; the full label stays available to
   * screen readers and as a tooltip. */
  compact?: boolean;
  className?: string;
}

/** "94% Compatible" — tinted by how strong the match is. */
export function AIMatchPill({ score, tier, compact = false, className = "" }: AIMatchPillProps) {
  return (
    <span
      title={`${TIER_LABELS[tier]} — ${score}% compatible`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold backdrop-blur-md ${TIER_STYLES[tier]} ${className}`}
    >
      <Sparkles className="size-3.5" aria-hidden />
      <span className="tabular-nums">{score}%</span>
      <span className={compact ? "sr-only" : undefined}> Compatible</span>
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
        <li key={reason} className="flex items-start gap-2 text-xs leading-snug text-white/65">
          <Check className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
          <span>{reason}</span>
        </li>
      ))}
    </ul>
  );
}
