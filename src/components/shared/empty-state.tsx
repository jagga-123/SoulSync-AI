import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
}: EmptyStateProps) {
  return (
    <div className="glass flex flex-col items-center gap-4 rounded-3xl px-6 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-brand shadow-lg shadow-primary/20">
        <Icon className="size-6 text-white" />
      </span>
      <div>
        <h3 className="font-display text-lg font-semibold text-white">{title}</h3>
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-white/55">
          {description}
        </p>
      </div>
      {actionLabel && actionHref && (
        <Button
          asChild
          className="mt-2 gap-2 rounded-full bg-gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-90"
        >
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      )}
    </div>
  );
}
