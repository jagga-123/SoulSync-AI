import { cn } from "@/lib/utils";

interface AvatarOrbProps {
  initials: string;
  gradient?: string;
  className?: string;
  ringed?: boolean;
}

export function AvatarOrb({
  initials,
  gradient = "from-primary to-secondary",
  className,
  ringed = true,
}: AvatarOrbProps) {
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br font-display font-semibold text-white",
        gradient,
        ringed && "ring-2 ring-white/15",
        className,
      )}
    >
      <span className="drop-shadow-sm">{initials}</span>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_55%)]" />
    </div>
  );
}
