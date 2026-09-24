"use client";

import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";

import { useRequireAuth } from "@/hooks/use-require-auth";
import { cn } from "@/lib/utils";
import type { AuthUser } from "@/types/api";

interface AppPageProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  width?: "narrow" | "default" | "wide";
  children: (user: AuthUser) => ReactNode;
}

const WIDTHS = { narrow: "max-w-2xl", default: "max-w-4xl", wide: "max-w-6xl" } as const;

/** Signed-in page frame: auth guard, loading state, and a consistent heading. */
export function AppPage({ title, description, actions, width = "default", children }: AppPageProps) {
  const { user, isLoading } = useRequireAuth();

  if (isLoading || !user) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Sparkles className="size-6 animate-pulse text-white/60" />
      </div>
    );
  }

  return (
    <div className={cn("relative mx-auto px-4 pb-16 pt-28 sm:px-6 lg:px-8", WIDTHS[width])}>
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-3xl font-semibold text-white">{title}</h1>
          {description && <p className="mt-1.5 max-w-xl text-sm text-white/55">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="mt-8">{children(user)}</div>
    </div>
  );
}

export function Section({ title, description, children, className }: { title?: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("glass flex h-full flex-col rounded-3xl p-5 sm:p-6", className)}>
      {title && <h2 className="font-display text-lg font-semibold text-white">{title}</h2>}
      {description && <p className="mt-1 text-sm text-white/50">{description}</p>}
      <div className={cn("flex-1", (title || description) && "mt-4")}>{children}</div>
    </section>
  );
}
