import { Heart } from "lucide-react";

import { cn } from "@/lib/utils";

/** 0–100 overlap → 1–5 hearts (docs/redesign/02 §5.3). A meter, not a grade: even the lowest area shows a heart. */
export function heartsFor(score: number): number {
  if (score < 20) return 1;
  if (score < 40) return 2;
  if (score < 60) return 3;
  if (score < 80) return 4;
  return 5;
}

interface HeartMeterProps {
  /** 0–100 overlap for one area. */
  score: number;
  /** The area's name — spoken as part of the value ("What you enjoy: 4 of 5 hearts"). */
  label: string;
  className?: string;
}

/** Five small hearts, filled to the area's overlap. One image for assistive tech; the hearts themselves are decoration. */
export function HeartMeter({ score, label, className }: HeartMeterProps) {
  const filled = heartsFor(score);
  return (
    <span role="img" aria-label={`${label}: ${filled} of 5 hearts`} className={cn("inline-flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Heart key={i} aria-hidden className={cn("size-4", i <= filled ? "fill-primary text-primary" : "text-white/25")} />
      ))}
    </span>
  );
}
